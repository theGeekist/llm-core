import { normalize, type JsonValue } from "@aifsd/strict-json";
import { isCanonicalUuid, isExternalId } from "@geekist/llm-core/contracts";
import type {
  AdmissionDecision,
  AdmissionRequest,
  ProjectAuthorityKind,
  ProjectDiagnostic,
  ProjectEventKind,
  ProjectObservation,
  ProjectProvenance,
  ProjectResult,
} from "./contract.js";

const eventKinds = new Set<ProjectEventKind>([
  "observation.accepted",
  "decision.accepted",
  "assertions.recorded",
  "assertions.retracted",
  "correction.accepted",
  "reversal.accepted",
]);

const authorityKinds = new Set<ProjectAuthorityKind>([
  "human",
  "coordinator",
  "worker",
  "integration",
  "plugin",
]);

const provenanceKinds = new Set<ProjectProvenance["sourceKind"]>([
  "human",
  "repository",
  "tool",
  "worker",
  "integration",
]);

const fail = (
  reasonCode: ProjectDiagnostic["reasonCode"],
  path?: string,
): ProjectResult<never> => ({
  ok: false,
  diagnostics: [{ code: "invalid-observation", reasonCode, ...(path ? { path } : {}) }],
});

const isRecord = (value: unknown): value is { [key: string]: JsonValue } =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (
  record: { [key: string]: JsonValue },
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in record) && Object.keys(record).every((key) => allowed.has(key))
  );
};

const stringAt = (record: { [key: string]: JsonValue }, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const isTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

const isAuthority = (value: JsonValue | undefined): boolean => {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ["authorityId", "kind"], ["delegationId"])) return false;
  const authorityId = stringAt(value, "authorityId");
  const kind = stringAt(value, "kind");
  return (
    authorityId !== null &&
    isExternalId(authorityId) &&
    kind !== null &&
    authorityKinds.has(kind as ProjectAuthorityKind) &&
    (value.delegationId === undefined ||
      (typeof value.delegationId === "string" && isExternalId(value.delegationId)))
  );
};

const isDigest = (value: JsonValue | undefined): boolean =>
  isRecord(value) &&
  hasExactKeys(value, ["algorithm", "value"]) &&
  value.algorithm === "sha-256" &&
  typeof value.value === "string" &&
  /^[0-9a-f]{64}$/.test(value.value);

const isProvenance = (value: JsonValue | undefined): boolean => {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ["sourceKind", "sourceRef"], ["revision", "contentDigest"])) {
    return false;
  }
  const sourceKind = stringAt(value, "sourceKind");
  return (
    stringAt(value, "sourceRef") !== null &&
    sourceKind !== null &&
    provenanceKinds.has(sourceKind as ProjectProvenance["sourceKind"]) &&
    (value.revision === undefined ||
      (typeof value.revision === "string" && isExternalId(value.revision))) &&
    (value.contentDigest === undefined || isDigest(value.contentDigest))
  );
};

const isEvidence = (value: JsonValue | undefined): boolean =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(isCanonicalUuid) &&
  new Set(value).size === value.length;

export const validateObservation = (input: unknown): ProjectResult<ProjectObservation> => {
  let value: JsonValue;
  try {
    value = normalize(input);
  } catch {
    return fail("non-portable-input");
  }
  if (!isRecord(value)) return fail("required-field-missing");
  if (
    !hasExactKeys(
      value,
      [
        "observationId",
        "projectId",
        "kind",
        "sourceAuthority",
        "provenance",
        "evidence",
        "correlationId",
        "observedAt",
        "payload",
      ],
      ["causationId"],
    )
  ) {
    return fail("unexpected-field");
  }
  const observationId = stringAt(value, "observationId");
  const projectId = stringAt(value, "projectId");
  const kind = stringAt(value, "kind");
  const correlationId = stringAt(value, "correlationId");
  const observedAt = stringAt(value, "observedAt");
  if (!observationId || !projectId || !kind || !correlationId || !observedAt) {
    return fail("required-field-missing");
  }
  if (!isExternalId(observationId) || !isExternalId(projectId)) {
    return fail("invalid-identifier");
  }
  if (!eventKinds.has(kind as ProjectEventKind)) return fail("invalid-identifier", "/kind");
  if (!isExternalId(correlationId)) return fail("invalid-identifier", "/correlationId");
  if (!isTimestamp(observedAt)) return fail("invalid-timestamp", "/observedAt");
  if (!isAuthority(value.sourceAuthority)) {
    return fail("required-field-missing", "/sourceAuthority");
  }
  if (!isProvenance(value.provenance)) {
    return fail("required-field-missing", "/provenance");
  }
  if (!isEvidence(value.evidence)) {
    return fail("evidence-required", "/evidence");
  }
  if (value.causationId !== undefined && !isCanonicalUuid(value.causationId)) {
    return fail("invalid-identifier", "/causationId");
  }
  if (!("payload" in value)) return fail("required-field-missing", "/payload");
  return { ok: true, value: value as unknown as ProjectObservation };
};

export const validateAdmissionRequest = (input: unknown): ProjectResult<AdmissionRequest> => {
  let value: JsonValue;
  try {
    value = normalize(input);
  } catch {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "non-portable-input" }],
    };
  }
  if (!isRecord(value) || !hasExactKeys(value, ["eventId", "observation"])) {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "unexpected-field" }],
    };
  }
  if (!isCanonicalUuid(value.eventId)) {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "invalid-identifier" }],
    };
  }
  const observation = validateObservation(value.observation);
  if (!observation.ok) return observation;
  return { ok: true, value: value as unknown as AdmissionRequest };
};

export const validateAdmissionDecision = (
  input: unknown,
  observation: ProjectObservation,
): ProjectResult<AdmissionDecision> => {
  let value: JsonValue;
  try {
    value = normalize(input);
  } catch {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "non-portable-input" }],
    };
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["decisionId", "authority", "policyId", "decidedAt"])
  ) {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "unexpected-field" }],
    };
  }
  const decidedAt = stringAt(value, "decidedAt");
  const decisionId = stringAt(value, "decisionId");
  const policyId = stringAt(value, "policyId");
  if (
    !decisionId ||
    !isExternalId(decisionId) ||
    !policyId ||
    !isExternalId(policyId) ||
    !decidedAt ||
    !isTimestamp(decidedAt) ||
    Date.parse(decidedAt) < Date.parse(observation.observedAt) ||
    !isAuthority(value.authority)
  ) {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "required-field-missing" }],
    };
  }
  return { ok: true, value: value as unknown as AdmissionDecision };
};
