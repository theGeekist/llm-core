import type { StepId } from "#contracts";
import {
  actionDigestInput,
  type ActionDigest,
  type BoundAction,
} from "../../features/tooling/public";
import {
  checkResumeCompatibility,
  isRegisteredResumableCheckpoint,
  resolveIntervention,
  type InterventionResolution,
} from "../../features/state/public";
import type {
  MeaningfulWorkflowStep,
  ResumeInterventionWorkflowInput,
  WorkflowCheckpointClaim,
  WorkflowCheckpointCommit,
  WorkflowDecisionToken,
  WorkflowResumeBeginResult,
  WorkflowResumeOutcome,
} from "./types";
import { executeSteps, unsafeEffect } from "./execution";

const reject = (
  reason: Extract<WorkflowResumeOutcome, { status: "rejected" }>["reason"],
): WorkflowResumeOutcome => ({ status: "rejected", reason });

const fail = (
  reason: Extract<WorkflowResumeOutcome, { status: "failed" }>["reason"],
  stepId?: StepId,
): WorkflowResumeOutcome => ({ status: "failed", reason, ...(stepId ? { stepId } : {}) });

const digestsMatch = (left: ActionDigest, right: ActionDigest): boolean =>
  left.algorithm === right.algorithm &&
  left.keyRef.secretId === right.keyRef.secretId &&
  left.value === right.value;

const findAuthorizedStep = (
  input: ResumeInterventionWorkflowInput,
): MeaningfulWorkflowStep | null => {
  const step = input.steps.find(
    (candidate) => candidate.stepId === input.intervention.intervention.stepId,
  );
  return step?.effect === "meaningful" ? step : null;
};

const workflowShapeIsValid = (
  input: ResumeInterventionWorkflowInput,
  authorized: MeaningfulWorkflowStep,
): boolean => {
  const stepIds = input.steps.map((step) => step.stepId);
  if (new Set(stepIds).size !== stepIds.length) {
    return false;
  }
  const known = new Set(stepIds);
  const completed = new Set(input.checkpoint.completedStepIds);
  const effects = new Map(
    input.checkpoint.recordedEffects.map((effect) => [effect.stepId, effect]),
  );
  if (
    input.checkpoint.completedStepIds.some((stepId) => !known.has(stepId)) ||
    input.checkpoint.recordedEffects.some((effect) => !known.has(effect.stepId)) ||
    !digestsMatch(authorized.action.digest, input.intervention.intervention.actionDigest)
  ) {
    return false;
  }
  return input.steps.every((step) => {
    const effect = effects.get(step.stepId);
    if (step.effect === "none") {
      return effect === undefined;
    }
    if (effect && !digestsMatch(effect.actionDigest, step.action.digest)) {
      return false;
    }
    if (completed.has(step.stepId)) {
      return effect?.status === "completed";
    }
    return step.stepId === authorized.stepId;
  });
};

const verifyAction = async (
  input: ResumeInterventionWorkflowInput,
  action: BoundAction,
): Promise<boolean> => {
  try {
    if (actionDigestInput(action.document) !== action.canonicalDocument) {
      return false;
    }
    return (
      (await input.actionDigestPort.verify({
        canonicalDocument: action.canonicalDocument,
        securityDomain: input.securityDomain,
        keyRef: action.digest.keyRef,
        digest: action.digest,
      })) === true
    );
  } catch {
    return false;
  }
};

const authenticateDecision = async (input: ResumeInterventionWorkflowInput): Promise<boolean> => {
  try {
    const result = await input.authentication.verify(input.intervention, input.decision);
    return (
      result.status === "authenticated" &&
      result.principal.principalId === input.decision.actor.principalId
    );
  } catch {
    return false;
  }
};

const shouldClaimCheckpoint = (resolution: InterventionResolution): boolean =>
  resolution.status === "approved" ||
  resolution.status === "denied" ||
  resolution.status === "cancelled";

const resolveDecision = (
  input: ResumeInterventionWorkflowInput,
): InterventionResolution | null => {
  try {
    return resolveIntervention(input.intervention, input.decision, input.clock.now());
  } catch {
    return null;
  }
};

const beginMatches = (
  input: ResumeInterventionWorkflowInput,
  result: Extract<WorkflowResumeBeginResult, { status: "accepted" }>,
  claimCheckpoint: boolean,
): boolean =>
  result.decision.decisionId === input.decision.decisionId &&
  result.decision.interventionId === input.intervention.intervention.interventionId &&
  result.decision.decisionToken.length > 0 &&
  (claimCheckpoint
    ? result.checkpoint?.checkpointId === input.checkpoint.checkpointId &&
      result.checkpoint.checkpointRevision === input.checkpoint.revision &&
      result.checkpoint.claimToken.length > 0
    : result.checkpoint === undefined);

const beginResume = async (
  input: ResumeInterventionWorkflowInput,
  resolution: InterventionResolution,
): Promise<Extract<WorkflowResumeBeginResult, { status: "accepted" }> | WorkflowResumeOutcome> => {
  const claimCheckpoint = shouldClaimCheckpoint(resolution);
  try {
    const result = await input.journal.begin({
      checkpointId: input.checkpoint.checkpointId,
      checkpointRevision: input.checkpoint.revision,
      interventionId: input.intervention.intervention.interventionId,
      decisionId: input.decision.decisionId,
      claimCheckpoint,
    });
    switch (result.status) {
      case "accepted":
        return beginMatches(input, result, claimCheckpoint)
          ? result
          : reject("resume-coordination-failed");
      case "decision-already-consumed":
        return reject("decision-already-consumed");
      case "intervention-already-resolved":
        return reject("intervention-already-resolved");
      case "checkpoint-already-claimed":
        return reject("checkpoint-already-claimed");
      case "checkpoint-already-consumed":
        return reject("checkpoint-already-consumed");
    }
    return reject("resume-coordination-failed");
  } catch {
    return reject("resume-coordination-failed");
  }
};

const nonApprovalOutcome = (
  resolution: Exclude<InterventionResolution, { status: "approved" | "rejected" }>,
): WorkflowResumeOutcome => {
  switch (resolution.status) {
    case "denied":
      return { status: "denied", reason: resolution.reason };
    case "deferred":
      return {
        status: "deferred",
        ...(resolution.resumeAfter ? { resumeAfter: resolution.resumeAfter } : {}),
        reason: resolution.reason,
      };
    case "edit-requires-new-binding":
      return {
        status: "edit-requires-new-binding",
        replacementArguments: resolution.replacementArguments,
        reason: resolution.reason,
      };
    case "cancelled":
      return { status: "cancelled", reason: resolution.reason };
    case "escalated":
      return {
        status: "escalated",
        escalateTo: resolution.escalateTo,
        reason: resolution.reason,
      };
  }
  throw new TypeError("Unsupported intervention resolution.");
};

const safelyQuarantine = async (input: {
  workflow: ResumeInterventionWorkflowInput;
  decision: WorkflowDecisionToken;
  claim?: WorkflowCheckpointClaim;
  reason: Parameters<ResumeInterventionWorkflowInput["journal"]["quarantine"]>[0]["reason"],
}): Promise<void> => {
  try {
    await input.workflow.journal.quarantine({
      decision: input.decision,
      ...(input.claim ? { claim: input.claim } : {}),
      reason: input.reason,
    });
  } catch {
    // The durable reservation must remain unavailable until reconciliation.
  }
};

const completeRetainedDecision = async (
  input: ResumeInterventionWorkflowInput,
  decision: WorkflowDecisionToken,
  outcome: Extract<
    WorkflowResumeOutcome,
    { status: "deferred" | "edit-requires-new-binding" | "escalated" }
  >,
): Promise<WorkflowResumeOutcome> => {
  try {
    if ((await input.journal.completeDecision({ decision, outcome: outcome.status })) === true) {
      return outcome;
    }
  } catch {
    // Convert persistence failures into a closed result below.
  }
  await safelyQuarantine({
    workflow: input,
    decision,
    reason: "persistence-failed",
  });
  return fail("resume-persistence-failed");
};

const checkpointCommit = (
  input: ResumeInterventionWorkflowInput,
  outcome: Extract<WorkflowResumeOutcome, { status: "completed" | "denied" | "cancelled" }>,
): WorkflowCheckpointCommit => ({
  disposition: outcome.status,
  state: outcome.status === "completed" ? outcome.state : input.checkpoint.state,
  completedStepIds:
    outcome.status === "completed"
      ? outcome.completedStepIds
      : input.checkpoint.completedStepIds,
  recordedEffects:
    outcome.status === "completed" ? outcome.recordedEffects : input.checkpoint.recordedEffects,
});

const completeClaimedCheckpoint = async (input: {
  workflow: ResumeInterventionWorkflowInput;
  decision: WorkflowDecisionToken;
  claim: WorkflowCheckpointClaim;
  outcome: Extract<WorkflowResumeOutcome, { status: "completed" | "denied" | "cancelled" }>,
}): Promise<WorkflowResumeOutcome> => {
  try {
    if (
      (await input.workflow.journal.completeCheckpoint({
        decision: input.decision,
        claim: input.claim,
        commit: checkpointCommit(input.workflow, input.outcome),
      })) === true
    ) {
      return input.outcome;
    }
  } catch {
    // Convert persistence failures into a closed result below.
  }
  await safelyQuarantine({
    workflow: input.workflow,
    decision: input.decision,
    claim: input.claim,
    reason: "persistence-failed",
  });
  return fail("resume-persistence-failed");
};

const persistResolution = async (
  input: ResumeInterventionWorkflowInput,
  begun: Extract<WorkflowResumeBeginResult, { status: "accepted" }>,
  resolution: Exclude<InterventionResolution, { status: "approved" | "rejected" }>,
): Promise<WorkflowResumeOutcome> => {
  const outcome = nonApprovalOutcome(resolution);
  if (
    outcome.status === "deferred" ||
    outcome.status === "edit-requires-new-binding" ||
    outcome.status === "escalated"
  ) {
    return completeRetainedDecision(input, begun.decision, outcome);
  }
  if ((outcome.status === "denied" || outcome.status === "cancelled") && begun.checkpoint) {
    return completeClaimedCheckpoint({
      workflow: input,
      decision: begun.decision,
      claim: begun.checkpoint,
      outcome,
    });
  }
  await safelyQuarantine({
    workflow: input,
    decision: begun.decision,
    ...(begun.checkpoint ? { claim: begun.checkpoint } : {}),
    reason: "persistence-failed",
  });
  return reject("resume-coordination-failed");
};

/** One authenticated, exact-action-bound workflow intervention/resume path. */
export const resumeInterventionWorkflow = async (
  input: ResumeInterventionWorkflowInput,
): Promise<WorkflowResumeOutcome> => {
  if (!isRegisteredResumableCheckpoint(input.checkpoint)) {
    return reject("checkpoint-not-registered");
  }
  const compatibility = checkResumeCompatibility(input.checkpoint, input.expectedCompatibility);
  if (!compatibility.compatible) {
    return { status: "incompatible", reason: compatibility.reason };
  }
  const authorized = findAuthorizedStep(input);
  if (
    !authorized ||
    input.intervention.intervention.checkpointId !== input.checkpoint.checkpointId ||
    input.intervention.intervention.checkpointRevision !== input.checkpoint.revision ||
    input.intervention.intervention.runId !== input.checkpoint.runId ||
    !workflowShapeIsValid(input, authorized)
  ) {
    return { status: "incompatible", reason: "workflow-shape-mismatch" };
  }
  const resolution = resolveDecision(input);
  if (!resolution || resolution.status === "rejected") {
    return reject("intervention-rejected");
  }
  if (!(await authenticateDecision(input))) {
    return reject("authentication-failed");
  }
  if (!(await verifyAction(input, authorized.action))) {
    return reject("action-verification-failed");
  }
  const begun = await beginResume(input, resolution);
  if (begun.status !== "accepted") {
    return begun;
  }
  const unsafe = unsafeEffect(input.checkpoint.recordedEffects);
  if (unsafe) {
    await safelyQuarantine({
      workflow: input,
      decision: begun.decision,
      ...(begun.checkpoint ? { claim: begun.checkpoint } : {}),
      reason: "effect-state-unsafe",
    });
    return {
      status: "reconciliation-required",
      stepId: unsafe.stepId,
      effectStatus: unsafe.status,
    };
  }
  if (resolution.status !== "approved") {
    return persistResolution(input, begun, resolution);
  }
  if (!begun.checkpoint) {
    await safelyQuarantine({
      workflow: input,
      decision: begun.decision,
      reason: "persistence-failed",
    });
    return reject("resume-coordination-failed");
  }
  const outcome = await executeSteps(input, begun.checkpoint);
  if (outcome.status !== "completed") {
    await safelyQuarantine({
      workflow: input,
      decision: begun.decision,
      claim: begun.checkpoint,
      reason: "execution-failed",
    });
    return outcome;
  }
  return completeClaimedCheckpoint({
    workflow: input,
    decision: begun.decision,
    claim: begun.checkpoint,
    outcome,
  });
};
