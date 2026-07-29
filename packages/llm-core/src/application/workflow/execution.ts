import type { JsonValue, StepId } from "#contracts";
import type { ActionDigest } from "../../features/tooling/public";
import {
  portableState,
  registerRecordedEffect,
  type RecordedEffect,
} from "../../features/state/public";
import type {
  MeaningfulWorkflowStep,
  ResumableWorkflowStep,
  ResumeInterventionWorkflowInput,
  WorkflowCheckpointClaim,
  WorkflowResumeOutcome,
} from "./types";

const digestsMatch = (left: ActionDigest, right: ActionDigest): boolean =>
  left.algorithm === right.algorithm &&
  left.keyRef.secretId === right.keyRef.secretId &&
  left.value === right.value;

const receiptsMatch = (left: RecordedEffect, right: RecordedEffect): boolean =>
  left.receipt.evidenceId === right.receipt.evidenceId;

const fail = (
  reason: Extract<WorkflowResumeOutcome, { status: "failed" }>["reason"],
  stepId?: StepId,
): WorkflowResumeOutcome => ({ status: "failed", reason, ...(stepId ? { stepId } : {}) });

export const unsafeEffect = (
  effects: readonly RecordedEffect[],
): (RecordedEffect & { status: "started" | "indeterminate" }) | undefined =>
  effects.find(
    (effect): effect is RecordedEffect & { status: "started" | "indeterminate" } =>
      effect.status === "started" || effect.status === "indeterminate",
  );

type NormalizedStepResult =
  | { valid: true; state: JsonValue; recordedEffect?: RecordedEffect }
  | { valid: false; reason: "effect-record-required" | "invalid-step-result" };

const normalizeStepResult = (
  step: ResumableWorkflowStep,
  result: Awaited<ReturnType<ResumableWorkflowStep["execute"]>>,
): NormalizedStepResult => {
  let state: JsonValue;
  try {
    state = portableState(result.state);
  } catch {
    return { valid: false, reason: "invalid-step-result" };
  }
  let recordedEffect: RecordedEffect | undefined;
  try {
    recordedEffect = result.recordedEffect
      ? registerRecordedEffect(result.recordedEffect)
      : undefined;
  } catch {
    return { valid: false, reason: "effect-record-required" };
  }
  if (step.effect === "meaningful" && recordedEffect?.status !== "completed") {
    return { valid: false, reason: "effect-record-required" };
  }
  if (step.effect === "none" && recordedEffect) {
    return { valid: false, reason: "effect-record-required" };
  }
  return { valid: true, state, ...(recordedEffect ? { recordedEffect } : {}) };
};

const validateStarted = (
  step: MeaningfulWorkflowStep,
  value: { durable: "acknowledged"; effect: RecordedEffect },
): RecordedEffect | null => {
  try {
    const effect = registerRecordedEffect(value.effect);
    return value.durable === "acknowledged" &&
      effect.status === "started" &&
      effect.stepId === step.stepId &&
      digestsMatch(effect.actionDigest, step.action.digest)
      ? effect
      : null;
  } catch {
    return null;
  }
};

const startEffect = async (
  input: ResumeInterventionWorkflowInput,
  claim: WorkflowCheckpointClaim,
  step: MeaningfulWorkflowStep,
): Promise<RecordedEffect | null> => {
  try {
    const started = await input.journal.recordEffectStarted({
      claim,
      stepId: step.stepId,
      actionDigest: step.action.digest,
    });
    return validateStarted(step, started);
  } catch {
    return null;
  }
};

const completeEffect = async (input: {
  workflow: ResumeInterventionWorkflowInput;
  claim: WorkflowCheckpointClaim;
  step: MeaningfulWorkflowStep;
  started: RecordedEffect;
  completed: RecordedEffect;
  state: JsonValue;
  completedStepIds: readonly StepId[];
}): Promise<boolean> => {
  if (
    input.completed.stepId !== input.step.stepId ||
    !digestsMatch(input.completed.actionDigest, input.step.action.digest) ||
    !receiptsMatch(input.started, input.completed)
  ) {
    return false;
  }
  try {
    return (
      (await input.workflow.journal.recordEffectCompleted({
        claim: input.claim,
        started: input.started,
        completed: input.completed,
        state: input.state,
        completedStepIds: input.completedStepIds,
      })) === true
    );
  } catch {
    return false;
  }
};

const executeStep = async (input: {
  workflow: ResumeInterventionWorkflowInput;
  claim: WorkflowCheckpointClaim;
  step: ResumableWorkflowStep;
  state: JsonValue;
  completedStepIds: readonly StepId[];
}): Promise<NormalizedStepResult> => {
  if (input.step.effect === "none") {
    try {
      return normalizeStepResult(input.step, await input.step.execute(input.state));
    } catch {
      return { valid: false, reason: "invalid-step-result" };
    }
  }
  const started = await startEffect(input.workflow, input.claim, input.step);
  if (!started) {
    return { valid: false, reason: "effect-record-required" };
  }
  let result;
  try {
    result = normalizeStepResult(
      input.step,
      await input.step.execute(input.state, input.step.action, started),
    );
  } catch {
    return { valid: false, reason: "invalid-step-result" };
  }
  if (!result.valid || !result.recordedEffect) {
    return result.valid ? { valid: false, reason: "effect-record-required" } : result;
  }
  const durable = await completeEffect({
    workflow: input.workflow,
    claim: input.claim,
    step: input.step,
    started,
    completed: result.recordedEffect,
    state: result.state,
    completedStepIds: [...input.completedStepIds, input.step.stepId],
  });
  return durable ? result : { valid: false, reason: "effect-record-required" };
};

export const executeSteps = async (
  input: ResumeInterventionWorkflowInput,
  claim: WorkflowCheckpointClaim,
): Promise<WorkflowResumeOutcome> => {
  const completed = [...input.checkpoint.completedStepIds];
  const effects = [...input.checkpoint.recordedEffects];
  let state = input.checkpoint.state;
  for (const step of input.steps) {
    if (completed.includes(step.stepId)) {
      continue;
    }
    const result = await executeStep({
      workflow: input,
      claim,
      step,
      state,
      completedStepIds: completed,
    });
    if (!result.valid) {
      return fail(result.reason, step.stepId);
    }
    state = result.state;
    completed.push(step.stepId);
    if (result.recordedEffect) {
      effects.push(result.recordedEffect);
    }
  }
  return {
    status: "completed",
    state,
    completedStepIds: Object.freeze(completed),
    recordedEffects: Object.freeze(effects),
  };
};
