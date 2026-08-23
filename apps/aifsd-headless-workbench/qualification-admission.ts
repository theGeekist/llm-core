import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  digest,
  type CorrelationId,
  type EventId,
  type EvidenceId,
} from "@geekist/llm-core/contracts";
import { contentDigest } from "../../packages/aifsd/src/config/content-digest.js";
import type {
  AcceptedProjectEvent,
  AdmissionAuthority,
  ProjectObservation,
} from "../../packages/aifsd/src/project-semantics/public.js";
import type { ProjectAdmissionDecisionClock } from "./runtime.js";

interface QualificationGateEvidence {
  readonly command: string;
  readonly name: string;
  readonly outputDigest: string;
  readonly result: "passed";
}

export interface QualificationReviewArtifact {
  readonly authorityId: string;
  readonly canonicalRef: string;
  readonly gates: readonly QualificationGateEvidence[];
  readonly implementationDigest: string;
  readonly manifestDigest: string;
  readonly projectId: string;
  readonly reviewedAt: string;
  readonly schemaVersion: 1;
  readonly sourceRef: string;
  readonly taskKey: string;
  readonly verdict: "accepted";
}

export interface LoadedQualificationReview {
  readonly artifact: QualificationReviewArtifact;
  readonly artifactDigest: ReturnType<typeof digest>;
}

export interface QualificationAdmissionContext {
  readonly authorityRevision: () => string;
  readonly correlationId: CorrelationId;
  readonly decisionClock: ProjectAdmissionDecisionClock;
  readonly evidenceEventId: EventId;
  readonly evidenceId: EvidenceId;
  readonly review: LoadedQualificationReview;
}

export const QUALIFICATION_ADMISSION_AUTHORITY_ID =
  "aifsd-headless-workbench-qualification-admission";

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

const isGate = (value: unknown): value is QualificationGateEvidence =>
  isRecord(value) &&
  exactKeys(value, ["command", "name", "outputDigest", "result"]) &&
  typeof value.command === "string" &&
  value.command.length > 0 &&
  typeof value.name === "string" &&
  value.name.length > 0 &&
  isSha256(value.outputDigest) &&
  value.result === "passed";

const requiredGateNames = new Set(["aifsd-release-check", "app-check", "workspace-diff-check"]);

const validateArtifact = (value: unknown): QualificationReviewArtifact => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "authorityId",
      "canonicalRef",
      "gates",
      "implementationDigest",
      "manifestDigest",
      "projectId",
      "reviewedAt",
      "schemaVersion",
      "sourceRef",
      "taskKey",
      "verdict",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.authorityId !== "string" ||
    value.authorityId.length === 0 ||
    typeof value.canonicalRef !== "string" ||
    value.canonicalRef.length === 0 ||
    !Array.isArray(value.gates) ||
    value.gates.length === 0 ||
    !value.gates.every(isGate) ||
    !isSha256(value.implementationDigest) ||
    !isSha256(value.manifestDigest) ||
    typeof value.projectId !== "string" ||
    value.projectId.length === 0 ||
    typeof value.reviewedAt !== "string" ||
    !Number.isFinite(Date.parse(value.reviewedAt)) ||
    typeof value.sourceRef !== "string" ||
    value.sourceRef.length === 0 ||
    typeof value.taskKey !== "string" ||
    value.taskKey.length === 0 ||
    value.verdict !== "accepted"
  ) {
    throw new TypeError("The independent review artefact is invalid");
  }
  const gateNames = new Set(value.gates.map(({ name }) => name));
  if (
    gateNames.size !== value.gates.length ||
    [...requiredGateNames].some((name) => !gateNames.has(name))
  ) {
    throw new TypeError("The independent review artefact has invalid gate coverage");
  }
  return value as unknown as QualificationReviewArtifact;
};

export interface QualificationImplementationInput {
  readonly identity: string;
  readonly path: string;
}

/** Reviewed closure of code and package identity executed by the real-task qualification. */
export const QUALIFICATION_IMPLEMENTATION_PATHS = [
  "apps/aifsd-headless-workbench/file-native-task-intent-store.ts",
  "apps/aifsd-headless-workbench/package.json",
  "apps/aifsd-headless-workbench/qualification-admission.ts",
  "apps/aifsd-headless-workbench/real-task-qualification.ts",
  "apps/aifsd-headless-workbench/runtime.ts",
  "bun.lock",
  "node_modules/@geekist/task-graph/package.json",
  "package.json",
  "packages/aifsd/package.json",
  "packages/aifsd/src/adapters/atomic-document-file.ts",
  "packages/aifsd/src/application/headless-workbench/public.ts",
  "packages/aifsd/src/application/headless-workbench/status-projection.ts",
  "packages/aifsd/src/application/headless-workbench/workbench.ts",
  "packages/aifsd/src/application/project/project-control-plane.ts",
  "packages/aifsd/src/application/project/public.ts",
  "packages/aifsd/src/config/content-digest.ts",
  "packages/aifsd/src/project-semantics/adapters/file-journal/public.ts",
  "packages/aifsd/src/project-semantics/adapters/native-task-authority/intent-store.ts",
  "packages/aifsd/src/project-semantics/adapters/native-task-authority/public.ts",
  "packages/aifsd/src/project-semantics/adapters/repository-corpus/observations.ts",
  "packages/aifsd/src/project-semantics/adapters/repository-corpus/public.ts",
  "packages/aifsd/src/project-semantics/adapters/repository-corpus/task-graph.ts",
  "packages/aifsd/src/project-semantics/admission.ts",
  "packages/aifsd/src/project-semantics/assertions.ts",
  "packages/aifsd/src/project-semantics/contract.ts",
  "packages/aifsd/src/project-semantics/derived-state.ts",
  "packages/aifsd/src/project-semantics/identity.ts",
  "packages/aifsd/src/project-semantics/journal.ts",
  "packages/aifsd/src/project-semantics/projection.ts",
  "packages/aifsd/src/project-semantics/public.ts",
  "packages/aifsd/src/project-semantics/validation.ts",
] as const;

export const qualificationImplementationDigest = async (
  inputs: readonly QualificationImplementationInput[],
): Promise<string> => {
  const hash = createHash("sha256");
  for (const { identity, path } of [...inputs].sort((left, right) =>
    left.identity.localeCompare(right.identity),
  )) {
    const bytes = await readFile(path);
    hash.update(identity);
    hash.update("\0");
    hash.update(bytes.byteLength.toString());
    hash.update("\0");
    hash.update(bytes);
  }
  return hash.digest("hex");
};

export const loadQualificationReview = async (
  path: string,
  expectedDigest: string,
  expected: {
    readonly canonicalRef: string;
    readonly implementationDigest: string;
    readonly manifestDigest: string;
    readonly projectId: string;
    readonly taskKey: string;
  },
): Promise<LoadedQualificationReview> => {
  if (!isSha256(expectedDigest)) throw new TypeError("The review artefact digest is invalid");
  const bytes = await readFile(path);
  if (sha256(bytes) !== expectedDigest)
    throw new TypeError("The review artefact digest does not match");
  const artifact = validateArtifact(JSON.parse(bytes.toString("utf8")));
  if (
    artifact.canonicalRef !== expected.canonicalRef ||
    artifact.implementationDigest !== expected.implementationDigest ||
    artifact.manifestDigest !== expected.manifestDigest ||
    artifact.projectId !== expected.projectId ||
    artifact.taskKey !== expected.taskKey
  ) {
    throw new TypeError("The review artefact does not bind the qualification context");
  }
  return { artifact, artifactDigest: digest(expectedDigest) };
};

const evidencePayload = (review: LoadedQualificationReview) => ({
  artifactDigest: review.artifactDigest,
  gates: review.artifact.gates,
  implementationDigest: review.artifact.implementationDigest,
  kind: "headless-workbench-independent-review-evidence",
  manifestDigest: review.artifact.manifestDigest,
  reviewedAt: review.artifact.reviewedAt,
  taskKey: review.artifact.taskKey,
  verdict: review.artifact.verdict,
});

export const createQualificationEvidenceObservation = (
  context: QualificationAdmissionContext,
  observedAt: string,
): ProjectObservation => ({
  correlationId: context.correlationId,
  evidence: [context.evidenceId],
  kind: "observation.accepted",
  observationId: `independent-review-evidence:${context.review.artifactDigest.value}`,
  observedAt,
  payload: evidencePayload(context.review) as unknown as ProjectObservation["payload"],
  projectId: context.review.artifact.projectId,
  provenance: {
    contentDigest: context.review.artifactDigest,
    revision: context.authorityRevision(),
    sourceKind: "worker",
    sourceRef: context.review.artifact.sourceRef,
  },
  sourceAuthority: {
    authorityId: context.review.artifact.authorityId,
    kind: "worker",
  },
});

export const createQualificationResultObservation = (
  context: QualificationAdmissionContext,
  evidenceEvent: AcceptedProjectEvent,
  observedAt: string,
): ProjectObservation => ({
  causationId: context.evidenceEventId,
  correlationId: context.correlationId,
  evidence: [context.evidenceId],
  kind: "decision.accepted",
  observationId: `independent-review-result:${evidenceEvent.eventDigest.value}`,
  observedAt,
  payload: {
    accepted: true,
    artifactDigest: context.review.artifactDigest,
    evidenceEventDigest: evidenceEvent.eventDigest,
    evidenceEventId: context.evidenceEventId,
    kind: "headless-workbench-result-accepted",
    taskKey: context.review.artifact.taskKey,
  },
  projectId: context.review.artifact.projectId,
  provenance: {
    contentDigest: context.review.artifactDigest,
    revision: context.authorityRevision(),
    sourceKind: "worker",
    sourceRef: context.review.artifact.sourceRef,
  },
  sourceAuthority: {
    authorityId: context.review.artifact.authorityId,
    kind: "worker",
  },
});

const same = (left: unknown, right: unknown): boolean =>
  contentDigest(left).value === contentDigest(right).value;

const evidenceEvent = (
  context: QualificationAdmissionContext,
  currentEvents: readonly AcceptedProjectEvent[],
): AcceptedProjectEvent | null => {
  const event = currentEvents.find(({ eventId }) => eventId === context.evidenceEventId);
  if (event === undefined) return null;
  const expected = createQualificationEvidenceObservation(context, event.observedAt);
  return event.kind === "observation.accepted" &&
    event.projectId === expected.projectId &&
    event.observationId === expected.observationId &&
    same(event.sourceAuthority, expected.sourceAuthority) &&
    same(event.provenance, expected.provenance) &&
    same(event.evidence, expected.evidence) &&
    same(event.payload, expected.payload)
    ? event
    : null;
};

export const createQualificationAdmissionAuthority = (
  context: QualificationAdmissionContext,
  operationalAuthority: AdmissionAuthority,
): AdmissionAuthority => ({
  authorityId: QUALIFICATION_ADMISSION_AUTHORITY_ID,
  decide: async (request, decisionContext) => {
    const observation = request.observation;
    const expectedEvidence = createQualificationEvidenceObservation(
      context,
      observation.observedAt,
    );
    let accepted = same(observation, expectedEvidence);
    if (!accepted && observation.kind === "decision.accepted") {
      const admittedEvidence = evidenceEvent(context, decisionContext.currentEvents);
      accepted =
        admittedEvidence !== null &&
        same(
          observation,
          createQualificationResultObservation(context, admittedEvidence, observation.observedAt),
        );
    }
    if (!accepted) return operationalAuthority.decide(request, decisionContext);
    return {
      authority: {
        authorityId: QUALIFICATION_ADMISSION_AUTHORITY_ID,
        kind: "coordinator",
      },
      decidedAt: context.decisionClock.decidedAt(observation.observedAt, decisionContext),
      decisionId: `headless-workbench:${observation.observationId}`,
      policyId: "headless-workbench/digest-bound-independent-review-v1",
    };
  },
});
