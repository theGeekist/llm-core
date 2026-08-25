import {
  coreId,
  externalId,
  isCanonicalUuid,
  isExternalId,
  isJsonValue,
  type ConversationId,
  type CorrelationId,
  type PrincipalId,
  type RunId,
} from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import type {
  AdmittedAgentActiveInput,
  AgentActiveInputAcknowledgement,
  AgentActiveInputAdmission,
  AgentActiveInputAuthorityCapability,
  AgentActiveInputClock,
  AgentActiveInputIdentity,
  AgentActiveInputAuthorityVerification,
  AgentActiveInputAuthorityVerifier,
  AgentActiveInputProcessingEvidence,
  AgentActiveInputRejectionReasonCode,
  AgentActiveInputRequest,
  NativeAgentRun,
} from "./types";

const REJECTION_REASONS = new Set<AgentActiveInputRejectionReasonCode>([
  "forged-authority",
  "unauthorised",
  "stale-authority",
  "duplicate-input",
  "provider-rejected",
]);
const UNAVAILABLE_REASONS = new Set(["provider-unobservable", "evidence-not-retained"]);
const EVIDENCE_STAGES = new Set(["recipient-observation", "semantic-processing"]);
const admittedInputs = new WeakSet<object>();

const isCanonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export const registerAgentActiveInputRequest = (input: unknown): AgentActiveInputRequest => {
  if (
    !isPortableRecord(input) ||
    !hasOnlyKeys(input, ["messageId", "correlationId", "submittedAt", "content"]) ||
    !isExternalId(input.messageId) ||
    !isExternalId(input.correlationId) ||
    !isCanonicalTimestamp(input.submittedAt) ||
    !isJsonValue(input.content)
  ) {
    throw new TypeError(
      "Active input requires closed portable content, stable identity and a canonical submission time.",
    );
  }
  return cloneFrozen({
    messageId: input.messageId,
    correlationId: externalId<CorrelationId>(input.correlationId),
    submittedAt: input.submittedAt,
    content: input.content,
  });
};

const registerAuthority = (input: unknown): AgentActiveInputAuthorityCapability | null => {
  if (
    !isPortableRecord(input) ||
    !hasOnlyKeys(input, [
      "kind",
      "authorityId",
      "issuer",
      "scope",
      "revision",
      "issuedAt",
      "expiresAt",
    ]) ||
    input.kind !== "agent-active-input-authority" ||
    !isExternalId(input.authorityId) ||
    !isExternalId(input.issuer) ||
    !isPortableRecord(input.scope) ||
    !hasOnlyKeys(input.scope, ["operation", "conversationId", "runId"]) ||
    input.scope.operation !== "run.input.submit" ||
    !isCanonicalUuid(input.scope.conversationId) ||
    !isCanonicalUuid(input.scope.runId) ||
    !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 0 ||
    !isCanonicalTimestamp(input.issuedAt) ||
    !isCanonicalTimestamp(input.expiresAt) ||
    Date.parse(input.issuedAt) >= Date.parse(input.expiresAt)
  ) {
    return null;
  }
  return cloneFrozen({
    kind: "agent-active-input-authority",
    authorityId: input.authorityId,
    issuer: externalId<PrincipalId>(input.issuer),
    scope: {
      operation: "run.input.submit",
      conversationId: coreId<ConversationId>(input.scope.conversationId),
      runId: coreId<RunId>(input.scope.runId),
    },
    revision: input.revision as number,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
};

const isVerification = (value: unknown): value is AgentActiveInputAuthorityVerification => {
  if (!isPortableRecord(value) || typeof value.status !== "string") {
    return false;
  }
  if (
    value.status === "verified" &&
    hasOnlyKeys(value, ["status", "issuer", "revision"]) &&
    isExternalId(value.issuer) &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) >= 0
  ) {
    return true;
  }
  return (
    (value.status === "forged" || value.status === "unauthorised") && hasOnlyKeys(value, ["status"])
  );
};

const rejectAdmission = (
  request: AgentActiveInputRequest,
  reasonCode: "forged-authority" | "unauthorised" | "stale-authority",
): AgentActiveInputAdmission => Object.freeze({ status: "rejected", request, reasonCode });

export const admitAgentActiveInput = (input: {
  readonly request: unknown;
  readonly authority: unknown;
  readonly conversationId: ConversationId;
  readonly runId: RunId;
  readonly clock: AgentActiveInputClock;
  readonly verifier: AgentActiveInputAuthorityVerifier;
}): MaybePromise<AgentActiveInputAdmission> => {
  const request = registerAgentActiveInputRequest(input.request);
  const verificationTime = input.clock.now();
  if (
    !isCanonicalUuid(input.conversationId) ||
    !isCanonicalUuid(input.runId) ||
    !isCanonicalTimestamp(verificationTime)
  ) {
    throw new TypeError("Active-input admission requires canonical conversation, run and time.");
  }
  const authority = registerAuthority(input.authority);
  if (!authority) {
    return rejectAdmission(request, "forged-authority");
  }
  if (
    authority.scope.conversationId !== input.conversationId ||
    authority.scope.runId !== input.runId
  ) {
    return rejectAdmission(request, "unauthorised");
  }
  if (
    Date.parse(authority.issuedAt) > Date.parse(verificationTime) ||
    Date.parse(authority.expiresAt) <= Date.parse(verificationTime)
  ) {
    return rejectAdmission(request, "stale-authority");
  }
  return maybeMap(
    (verification: AgentActiveInputAuthorityVerification) => {
      if (!isVerification(verification) || verification.status === "forged") {
        return rejectAdmission(request, "forged-authority");
      }
      if (verification.status === "unauthorised") {
        return rejectAdmission(request, "unauthorised");
      }
      if (verification.issuer !== authority.issuer) {
        return rejectAdmission(request, "forged-authority");
      }
      if (verification.revision !== authority.revision) {
        return rejectAdmission(request, "stale-authority");
      }
      const admittedAt = input.clock.now();
      if (
        !isCanonicalTimestamp(admittedAt) ||
        Date.parse(authority.issuedAt) > Date.parse(admittedAt) ||
        Date.parse(authority.expiresAt) <= Date.parse(admittedAt)
      ) {
        return rejectAdmission(request, "stale-authority");
      }
      const admitted = cloneFrozen({
        ...request,
        authorityReceipt: {
          authorityId: authority.authorityId,
          issuer: authority.issuer,
          scope: authority.scope,
          revision: authority.revision,
          admittedAt,
          expiresAt: authority.expiresAt,
        },
      }) as AdmittedAgentActiveInput;
      admittedInputs.add(admitted);
      return Object.freeze({ status: "admitted", input: admitted });
    },
    input.verifier.verify({
      authority,
      conversationId: input.conversationId,
      runId: input.runId,
      now: verificationTime,
    }),
  );
};

export const isAdmittedAgentActiveInput = (value: unknown): value is AdmittedAgentActiveInput =>
  typeof value === "object" && value !== null && admittedInputs.has(value);

export const createAgentActiveInputRejection = (
  request: AgentActiveInputRequest,
  reasonCode: AgentActiveInputRejectionReasonCode,
  acknowledgedAt: string,
): AgentActiveInputAcknowledgement => {
  if (!isCanonicalTimestamp(acknowledgedAt) || !REJECTION_REASONS.has(reasonCode)) {
    throw new TypeError("Active-input rejection requires a closed reason and canonical time.");
  }
  return cloneFrozen({
    status: "rejected",
    messageId: request.messageId,
    correlationId: request.correlationId,
    acknowledgedAt,
    reasonCode,
  });
};

export const registerAgentActiveInputAcknowledgement = (
  input: unknown,
  request: AgentActiveInputRequest,
): AgentActiveInputAcknowledgement => {
  if (
    !isPortableRecord(input) ||
    typeof input.status !== "string" ||
    input.messageId !== request.messageId ||
    input.correlationId !== request.correlationId ||
    !isCanonicalTimestamp(input.acknowledgedAt)
  ) {
    throw new TypeError("Active-input acknowledgements must bind to the submitted message.");
  }
  const ordinary = ["accepted", "already-terminal", "unsupported"].includes(input.status);
  const rejected =
    input.status === "rejected" &&
    REJECTION_REASONS.has(input.reasonCode as AgentActiveInputRejectionReasonCode);
  if (
    (ordinary && !hasOnlyKeys(input, ["status", "messageId", "correlationId", "acknowledgedAt"])) ||
    (rejected &&
      !hasOnlyKeys(input, [
        "status",
        "messageId",
        "correlationId",
        "acknowledgedAt",
        "reasonCode",
      ])) ||
    (!ordinary && !rejected)
  ) {
    throw new TypeError("Active-input acknowledgements require a closed exact outcome.");
  }
  return cloneFrozen(input) as unknown as AgentActiveInputAcknowledgement;
};

export const registerAgentActiveInputProcessingEvidence = (
  input: unknown,
  identity: AgentActiveInputIdentity,
): AgentActiveInputProcessingEvidence => {
  if (
    !isPortableRecord(input) ||
    !isExternalId(identity.messageId) ||
    !isExternalId(identity.correlationId) ||
    input.messageId !== identity.messageId ||
    input.correlationId !== identity.correlationId ||
    typeof input.status !== "string"
  ) {
    throw new TypeError(
      "Active-input evidence must bind to the requested message and correlation.",
    );
  }
  const observed = input.status === "recipient-observed";
  const processed = input.status === "processing-observed";
  const unavailable = input.status === "unavailable";
  const valid =
    (observed &&
      hasOnlyKeys(input, ["status", "messageId", "correlationId", "observedAt", "evidenceRef"]) &&
      isCanonicalTimestamp(input.observedAt) &&
      isExternalId(input.evidenceRef)) ||
    (processed &&
      hasOnlyKeys(input, ["status", "messageId", "correlationId", "observedAt", "causationRef"]) &&
      isCanonicalTimestamp(input.observedAt) &&
      isExternalId(input.causationRef)) ||
    (unavailable &&
      hasOnlyKeys(input, [
        "status",
        "messageId",
        "correlationId",
        "stage",
        "declaredAt",
        "reasonCode",
      ]) &&
      EVIDENCE_STAGES.has(input.stage as string) &&
      isCanonicalTimestamp(input.declaredAt) &&
      UNAVAILABLE_REASONS.has(input.reasonCode as string));
  if (!valid) {
    throw new TypeError(
      "Active-input evidence requires a closed observation or unavailable outcome.",
    );
  }
  return cloneFrozen(input) as unknown as AgentActiveInputProcessingEvidence;
};

export const isNativeAgentRun = (value: unknown): value is NativeAgentRun =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Partial<NativeAgentRun>).providerSession === "function" &&
  typeof (value as Partial<NativeAgentRun>).submitInput === "function" &&
  typeof (value as Partial<NativeAgentRun>).activeInputEvidence === "function";
