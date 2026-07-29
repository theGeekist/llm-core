import { isExternalId, isJsonValue, type JsonValue } from "#contracts";
import type {
  InterventionDecision,
  InterventionDecisionId,
  InterventionId,
  InterventionKind,
  InterventionRequest,
} from "./types";
import {
  clonePortable,
  deepFreeze,
  hasOnlyKeys,
  isCanonicalTimestamp,
  isEvidenceRef,
  isRecord,
} from "./validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTION_DIGEST = /^[A-Za-z0-9_-]{43}$/;
const INTERVENTION_KINDS = new Set<InterventionKind>([
  "approve",
  "deny",
  "defer",
  "edit",
  "cancel",
  "escalate",
]);

const interventionUuid = <TId extends string>(value: string, label: string): TId => {
  if (!UUID.test(value)) {
    throw new TypeError(`${label} must be a canonical lowercase RFC 9562 UUID.`);
  }
  return value as TId;
};

export const interventionId = (value: string): InterventionId =>
  interventionUuid<InterventionId>(value, "Intervention IDs");

export const interventionDecisionId = (value: string): InterventionDecisionId =>
  interventionUuid<InterventionDecisionId>(value, "Intervention decision IDs");

const digestMatches = (
  left: InterventionRequest["intervention"]["actionDigest"],
  right: InterventionDecision["intervention"]["actionDigest"],
): boolean =>
  left.algorithm === right.algorithm &&
  left.keyRef.secretId === right.keyRef.secretId &&
  left.value === right.value;

const isCanonicalActionDigest = (
  value: InterventionRequest["intervention"]["actionDigest"],
): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["algorithm", "keyRef", "value"]) &&
  value.algorithm === "hmac-sha-256" &&
  isRecord(value.keyRef) &&
  hasOnlyKeys(value.keyRef, ["secretId"]) &&
  isExternalId(value.keyRef.secretId) &&
  typeof value.value === "string" &&
  ACTION_DIGEST.test(value.value);

const isValidInterventionRef = (value: InterventionRequest["intervention"]): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "interventionId",
    "checkpointId",
    "checkpointRevision",
    "runId",
    "stepId",
    "actionDigest",
  ]) &&
  typeof value.interventionId === "string" &&
  UUID.test(value.interventionId) &&
  typeof value.checkpointId === "string" &&
  UUID.test(value.checkpointId) &&
  typeof value.runId === "string" &&
  UUID.test(value.runId) &&
  typeof value.stepId === "string" &&
  UUID.test(value.stepId) &&
  typeof value.checkpointRevision === "number" &&
  Number.isSafeInteger(value.checkpointRevision) &&
  value.checkpointRevision >= 0 &&
  isCanonicalActionDigest(value.actionDigest);

const isValidDecision = (decision: InterventionDecision): boolean => {
  if (
    !isRecord(decision) ||
    typeof decision.decisionId !== "string" ||
    !UUID.test(decision.decisionId) ||
    !isValidInterventionRef(decision.intervention) ||
    !isCanonicalTimestamp(decision.decidedAt) ||
    !isRecord(decision.actor) ||
    !hasOnlyKeys(decision.actor, ["principalId"]) ||
    !isExternalId(decision.actor.principalId) ||
    !isRecord(decision.authentication) ||
    !hasOnlyKeys(decision.authentication, ["scheme", "evidence"]) ||
    !isExternalId(decision.authentication.scheme) ||
    !isEvidenceRef(decision.authentication.evidence) ||
    (decision.reason !== undefined && typeof decision.reason !== "string")
  ) {
    return false;
  }
  const base = [
    "decisionId",
    "intervention",
    "decidedAt",
    "actor",
    "authentication",
    "reason",
    "decision",
  ];
  switch (decision.decision) {
    case "approve":
    case "deny":
    case "cancel":
      return hasOnlyKeys(decision, base);
    case "defer":
      return (
        hasOnlyKeys(decision, [...base, "resumeAfter"]) &&
        (decision.resumeAfter === undefined || isCanonicalTimestamp(decision.resumeAfter))
      );
    case "edit":
      return (
        hasOnlyKeys(decision, [...base, "replacementArguments"]) &&
        isJsonValue(decision.replacementArguments)
      );
    case "escalate":
      return (
        hasOnlyKeys(decision, [...base, "escalateTo"]) &&
        isRecord(decision.escalateTo) &&
        hasOnlyKeys(decision.escalateTo, ["principalId"]) &&
        isExternalId(decision.escalateTo.principalId)
      );
    default:
      return false;
  }
};

const isValidRequest = (request: InterventionRequest): boolean =>
  isRecord(request) &&
  hasOnlyKeys(request, ["intervention", "requestedAt", "expiresAt", "allowed", "reason"]) &&
  isCanonicalTimestamp(request.requestedAt) &&
  isCanonicalTimestamp(request.expiresAt) &&
  Date.parse(request.requestedAt) < Date.parse(request.expiresAt) &&
  Array.isArray(request.allowed) &&
  request.allowed.length > 0 &&
  new Set(request.allowed).size === request.allowed.length &&
  request.allowed.every((kind) => INTERVENTION_KINDS.has(kind)) &&
  isValidInterventionRef(request.intervention) &&
  (request.reason === undefined || typeof request.reason === "string");

export type InterventionResolution =
  | { status: "approved" }
  | { status: "denied"; reason?: string }
  | { status: "deferred"; resumeAfter?: string; reason?: string }
  | { status: "edit-requires-new-binding"; replacementArguments: JsonValue; reason?: string }
  | { status: "cancelled"; reason?: string }
  | { status: "escalated"; escalateTo: InterventionDecision["actor"]; reason?: string }
  | {
      status: "rejected";
      reason:
        | "action-digest-mismatch"
        | "checkpoint-mismatch"
        | "decision-not-allowed"
        | "identity-mismatch"
        | "invalid-decision"
        | "invalid-request"
        | "invalid-timestamp"
        | "outside-intervention-window"
        | "stale-decision";
    };

export const createInterventionRequest = (request: InterventionRequest): InterventionRequest => {
  if (!isValidRequest(request)) {
    throw new TypeError("Intervention requests require a timestamp and distinct allowed decisions.");
  }
  return deepFreeze(clonePortable(request));
};

const reject = (
  reason: Extract<InterventionResolution, { status: "rejected" }>["reason"],
): InterventionResolution => ({ status: "rejected", reason });

const hasMatchingIdentity = (
  request: InterventionRequest,
  decision: InterventionDecision,
): boolean =>
  request.intervention.interventionId === decision.intervention.interventionId &&
  request.intervention.runId === decision.intervention.runId &&
  request.intervention.stepId === decision.intervention.stepId;

const hasMatchingCheckpoint = (
  request: InterventionRequest,
  decision: InterventionDecision,
): boolean =>
  request.intervention.checkpointId === decision.intervention.checkpointId &&
  request.intervention.checkpointRevision === decision.intervention.checkpointRevision;

export const resolveIntervention = (
  request: InterventionRequest,
  decision: InterventionDecision,
  now: string,
): InterventionResolution => {
  if (!isValidRequest(request)) {
    return reject("invalid-request");
  }
  if (
    !isCanonicalTimestamp(request.requestedAt) ||
    !isCanonicalTimestamp(decision.decidedAt) ||
    !isCanonicalTimestamp(now)
  ) {
    return reject("invalid-timestamp");
  }
  if (!isValidDecision(decision)) {
    return reject("invalid-decision");
  }
  if (Date.parse(decision.decidedAt) < Date.parse(request.requestedAt)) {
    return reject("stale-decision");
  }
  if (
    Date.parse(decision.decidedAt) > Date.parse(now) ||
    Date.parse(decision.decidedAt) >= Date.parse(request.expiresAt) ||
    Date.parse(now) >= Date.parse(request.expiresAt)
  ) {
    return reject("outside-intervention-window");
  }
  if (!hasMatchingIdentity(request, decision)) {
    return reject("identity-mismatch");
  }
  if (!hasMatchingCheckpoint(request, decision)) {
    return reject("checkpoint-mismatch");
  }
  if (!digestMatches(request.intervention.actionDigest, decision.intervention.actionDigest)) {
    return reject("action-digest-mismatch");
  }
  if (!request.allowed.includes(decision.decision as InterventionKind)) {
    return reject("decision-not-allowed");
  }

  switch (decision.decision) {
    case "approve":
      return { status: "approved" };
    case "deny":
      return { status: "denied", reason: decision.reason };
    case "defer":
      return {
        status: "deferred",
        ...(decision.resumeAfter ? { resumeAfter: decision.resumeAfter } : {}),
        reason: decision.reason,
      };
    case "edit":
      return {
        status: "edit-requires-new-binding",
        replacementArguments: deepFreeze(clonePortable(decision.replacementArguments)),
        reason: decision.reason,
      };
    case "cancel":
      return { status: "cancelled", reason: decision.reason };
    case "escalate":
      return {
        status: "escalated",
        escalateTo: deepFreeze(clonePortable(decision.escalateTo)),
        reason: decision.reason,
      };
  }
  throw new TypeError("Unsupported intervention decision.");
};
