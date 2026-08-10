import { snapshot, StrictJsonError } from "@aifsd/strict-json";
import { isCanonicalUuid, isDigest, isSchemaRef } from "@aifsd/llm-core/contracts";
import type {
  EvidenceRef,
  IntegrationManifest,
  IntegrationResult,
  NativeObservation,
  QualificationBoundaryEvidence,
  QualificationEvidence,
  QualificationExecution,
  QualificationExecutor,
  QualificationExecutorAdmission,
  QualificationExecutorAuthority,
  QualificationRequest,
} from "./contract.js";
import {
  integrationClosureDigest,
  integrationContentDigest,
  sameDigest,
} from "./content-identity.js";
import {
  type IntegrationArtifactBinding,
  validateIntegrationArtifactBinding,
  validateIntegrationManifest,
} from "./validation.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));

const strings = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);

const evidenceKinds = new Set([
  "artifact",
  "checkpoint",
  "evaluation",
  "event-payload",
  "execution-receipt",
  "other",
  "tool-arguments",
  "tool-result",
]);
const mediaType = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;

const validEvidenceRef = (value: unknown): value is EvidenceRef => {
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) => ["evidenceId", "kind", "content", "schema"].includes(key)) ||
    !["evidenceId", "kind", "content"].every((key) => Object.hasOwn(value, key))
  ) {
    return false;
  }
  const content = value.content;
  return (
    isCanonicalUuid(value.evidenceId) &&
    typeof value.kind === "string" &&
    evidenceKinds.has(value.kind) &&
    (value.schema === undefined || isSchemaRef(value.schema)) &&
    isRecord(content) &&
    exactKeys(content, ["resourceId", "mediaType", "byteLength", "digest"]) &&
    isCanonicalUuid(content.resourceId) &&
    typeof content.mediaType === "string" &&
    mediaType.test(content.mediaType) &&
    Number.isSafeInteger(content.byteLength) &&
    (content.byteLength as number) >= 0 &&
    isDigest(content.digest)
  );
};

const invalid = <T>(reasonCode: string, path?: string): IntegrationResult<T> => ({
  ok: false,
  diagnostics: [{ code: "qualification-boundary-invalid", reasonCode, ...(path ? { path } : {}) }],
});

const requestInvalid = <T>(reasonCode: string, path?: string): IntegrationResult<T> => ({
  ok: false,
  diagnostics: [{ code: "qualification-request-invalid", reasonCode, ...(path ? { path } : {}) }],
});

const admissionInvalid = <T>(reasonCode: string, path?: string): IntegrationResult<T> => ({
  ok: false,
  diagnostics: [
    {
      code: "qualification-executor-admission-invalid",
      reasonCode,
      ...(path ? { path } : {}),
    },
  ],
});

const trustLevels = new Set(["local", "community", "verified", "official"]);

export const validateQualificationRequest = (
  input: unknown,
): IntegrationResult<QualificationRequest> => {
  let value: unknown;
  try {
    value = snapshot(input);
  } catch (error) {
    return requestInvalid(error instanceof StrictJsonError ? error.code : "inspection-failed");
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, ["acquisition", "suiteDigest", "qualifiedAt"]) ||
    !isDigest(value.suiteDigest) ||
    typeof value.qualifiedAt !== "string" ||
    !Number.isFinite(Date.parse(value.qualifiedAt)) ||
    !isRecord(value.acquisition) ||
    !exactKeys(value.acquisition, [
      "manifest",
      "manifestDigest",
      "rootArtifact",
      "executableClosure",
      "trust",
      "acquiredAt",
    ]) ||
    !isDigest(value.acquisition.manifestDigest) ||
    typeof value.acquisition.trust !== "string" ||
    !trustLevels.has(value.acquisition.trust) ||
    typeof value.acquisition.acquiredAt !== "string" ||
    !Number.isFinite(Date.parse(value.acquisition.acquiredAt))
  ) {
    return requestInvalid("closed-qualification-request-required");
  }
  const manifest = validateIntegrationManifest(value.acquisition.manifest);
  if (!manifest.ok) return requestInvalid("acquisition-manifest-invalid", "/acquisition/manifest");
  const binding = validateIntegrationArtifactBinding({
    rootArtifact: value.acquisition.rootArtifact,
    executableClosure: value.acquisition.executableClosure,
  });
  if (!binding.ok) return requestInvalid("acquisition-binding-invalid", "/acquisition");
  if (
    !sameDigest(value.acquisition.manifestDigest, integrationContentDigest(manifest.value)) ||
    Date.parse(value.qualifiedAt) < Date.parse(value.acquisition.acquiredAt)
  ) {
    return requestInvalid("qualification-request-subject-mismatch");
  }
  return { ok: true, value: value as unknown as QualificationRequest };
};

const executorAdmissionKeys = [
  "authorityId",
  "admissionId",
  "executorId",
  "workerId",
  "admittedAt",
  "expiresAt",
  "signature",
] as const;

export const validateQualificationExecutorAdmission = (
  input: unknown,
  context: {
    readonly executor: QualificationExecutor;
    readonly authority: QualificationExecutorAuthority;
    readonly at: string;
  },
): IntegrationResult<QualificationExecutorAdmission> => {
  let value: unknown;
  try {
    value = snapshot(input);
  } catch (error) {
    return admissionInvalid(error instanceof StrictJsonError ? error.code : "inspection-failed");
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, executorAdmissionKeys) ||
    value.authorityId !== context.authority.authorityId ||
    value.executorId !== context.executor.executorId ||
    value.workerId !== context.executor.workerId ||
    typeof value.admissionId !== "string" ||
    value.admissionId.length === 0 ||
    typeof value.admittedAt !== "string" ||
    !Number.isFinite(Date.parse(value.admittedAt)) ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.admittedAt) > Date.parse(context.at) ||
    Date.parse(value.expiresAt) <= Date.parse(context.at) ||
    typeof value.signature !== "string" ||
    value.signature.length === 0
  ) {
    return admissionInvalid("closed-executor-admission-required");
  }
  return { ok: true, value: value as unknown as QualificationExecutorAdmission };
};

const validRecordedExecutorAdmission = (value: unknown): value is QualificationExecutorAdmission =>
  isRecord(value) &&
  exactKeys(value, executorAdmissionKeys) &&
  ["authorityId", "admissionId", "executorId", "workerId", "signature"].every(
    (key) => typeof value[key] === "string" && value[key].length > 0,
  ) &&
  typeof value.admittedAt === "string" &&
  Number.isFinite(Date.parse(value.admittedAt)) &&
  typeof value.expiresAt === "string" &&
  Number.isFinite(Date.parse(value.expiresAt)) &&
  Date.parse(value.expiresAt) > Date.parse(value.admittedAt);

const observationOutcomes = new Set([
  "observed-supported",
  "observed-unsupported",
  "observed-not-applicable",
]);
const observationBases = new Set(["execution", "pinned-source"]);

const validObservation = (value: unknown): value is NativeObservation =>
  isRecord(value) &&
  exactKeys(value, ["operationId", "upstreamVersion", "outcome", "basis", "evidence"]) &&
  typeof value.operationId === "string" &&
  value.operationId.length > 0 &&
  typeof value.upstreamVersion === "string" &&
  value.upstreamVersion.length > 0 &&
  typeof value.outcome === "string" &&
  observationOutcomes.has(value.outcome) &&
  typeof value.basis === "string" &&
  observationBases.has(value.basis) &&
  validEvidenceRef(value.evidence);

const boundaryKeys = [
  "executorId",
  "workerId",
  "policyDigest",
  "rootArtifactDigest",
  "subjectClosureDigest",
  "suiteDigest",
  "isolatedWorker",
  "ambientCredentials",
  "lifecycleScriptsEnabled",
  "filesystem",
  "process",
  "network",
  "environmentKeys",
  "startedAt",
  "completedAt",
  "exitCode",
  "evidence",
] as const;

const allowedFilesystem = new Set(["package:read", "scratch:write"]);
const allowedProcess = new Set(["python"]);
const allowedEnvironmentKeys = new Set([
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "PYTHONDONTWRITEBYTECODE",
  "PYTHONNOUSERSITE",
  "PYTHONPATH",
  "TMPDIR",
  "UV_CACHE_DIR",
]);

const validBoundary = (value: unknown): value is QualificationBoundaryEvidence =>
  isRecord(value) &&
  exactKeys(value, boundaryKeys) &&
  typeof value.executorId === "string" &&
  value.executorId.length > 0 &&
  typeof value.workerId === "string" &&
  value.workerId.length > 0 &&
  isDigest(value.policyDigest) &&
  isDigest(value.rootArtifactDigest) &&
  isDigest(value.subjectClosureDigest) &&
  isDigest(value.suiteDigest) &&
  value.isolatedWorker === true &&
  value.ambientCredentials === false &&
  value.lifecycleScriptsEnabled === false &&
  strings(value.filesystem) &&
  value.filesystem.every((item) => allowedFilesystem.has(item)) &&
  strings(value.process) &&
  value.process.every((item) => allowedProcess.has(item)) &&
  Array.isArray(value.network) &&
  value.network.length === 0 &&
  strings(value.environmentKeys) &&
  value.environmentKeys.every((item) => allowedEnvironmentKeys.has(item)) &&
  typeof value.startedAt === "string" &&
  Number.isFinite(Date.parse(value.startedAt)) &&
  typeof value.completedAt === "string" &&
  Number.isFinite(Date.parse(value.completedAt)) &&
  Date.parse(value.completedAt) >= Date.parse(value.startedAt) &&
  value.exitCode === 0 &&
  validEvidenceRef(value.evidence);

export const validateQualificationExecution = (
  input: unknown,
  request: QualificationRequest,
  executor: QualificationExecutor,
): IntegrationResult<QualificationExecution> => {
  let value: unknown;
  try {
    value = snapshot(input);
  } catch (error) {
    return invalid(error instanceof StrictJsonError ? error.code : "inspection-failed");
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, ["observations", "boundary", "executionDigest"]) ||
    !Array.isArray(value.observations) ||
    value.observations.length === 0 ||
    !value.observations.every(validObservation) ||
    !validBoundary(value.boundary) ||
    !isDigest(value.executionDigest)
  ) {
    return invalid("closed-executor-evidence-required");
  }
  const execution = value as unknown as QualificationExecution;
  const expectedExecutionDigest = integrationContentDigest({
    observations: execution.observations,
    boundary: execution.boundary,
  });
  const expectedClosureDigest = integrationClosureDigest(request.acquisition.executableClosure);
  if (
    execution.boundary.executorId !== executor.executorId ||
    execution.boundary.workerId !== executor.workerId ||
    !sameDigest(execution.boundary.rootArtifactDigest, request.acquisition.rootArtifact.digest) ||
    !sameDigest(execution.boundary.subjectClosureDigest, expectedClosureDigest) ||
    !sameDigest(execution.boundary.suiteDigest, request.suiteDigest) ||
    !sameDigest(execution.executionDigest, expectedExecutionDigest)
  ) {
    return invalid("executor-evidence-subject-mismatch");
  }
  return { ok: true, value: execution };
};

const evidenceKeys = [
  "status",
  "integrationName",
  "integrationVersion",
  "manifestDigest",
  "rootArtifactDigest",
  "subjectClosureDigest",
  "suiteDigest",
  "observations",
  "boundary",
  "executionDigest",
  "executorId",
  "workerId",
  "executorAdmission",
  "qualifiedAt",
  "evidenceDigest",
] as const;

export const validateQualificationEvidence = (
  input: unknown,
): IntegrationResult<QualificationEvidence> => {
  let value: unknown;
  try {
    value = snapshot(input);
  } catch (error) {
    return invalid(error instanceof StrictJsonError ? error.code : "inspection-failed");
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, evidenceKeys) ||
    value.status !== "qualified" ||
    typeof value.integrationName !== "string" ||
    typeof value.integrationVersion !== "string" ||
    typeof value.executorId !== "string" ||
    typeof value.workerId !== "string" ||
    !validRecordedExecutorAdmission(value.executorAdmission) ||
    typeof value.qualifiedAt !== "string" ||
    !Number.isFinite(Date.parse(value.qualifiedAt)) ||
    !isDigest(value.manifestDigest) ||
    !isDigest(value.rootArtifactDigest) ||
    !isDigest(value.subjectClosureDigest) ||
    !isDigest(value.suiteDigest) ||
    !validBoundary(value.boundary) ||
    !isDigest(value.executionDigest) ||
    !isDigest(value.evidenceDigest) ||
    !Array.isArray(value.observations) ||
    value.observations.length === 0 ||
    !value.observations.every(validObservation)
  ) {
    return invalid("closed-qualification-evidence-required");
  }
  const evidence = value as unknown as QualificationEvidence;
  const { evidenceDigest, ...base } = evidence;
  if (
    !sameDigest(evidenceDigest, integrationContentDigest(base)) ||
    evidence.executorId !== evidence.boundary.executorId ||
    evidence.workerId !== evidence.boundary.workerId ||
    evidence.executorId !== evidence.executorAdmission.executorId ||
    evidence.workerId !== evidence.executorAdmission.workerId ||
    Date.parse(evidence.executorAdmission.admittedAt) > Date.parse(evidence.qualifiedAt) ||
    Date.parse(evidence.qualifiedAt) >= Date.parse(evidence.executorAdmission.expiresAt) ||
    !sameDigest(evidence.rootArtifactDigest, evidence.boundary.rootArtifactDigest) ||
    !sameDigest(evidence.subjectClosureDigest, evidence.boundary.subjectClosureDigest) ||
    !sameDigest(evidence.suiteDigest, evidence.boundary.suiteDigest) ||
    !sameDigest(
      evidence.executionDigest,
      integrationContentDigest({
        observations: evidence.observations,
        boundary: evidence.boundary,
      }),
    )
  ) {
    return invalid("qualification-evidence-digest-mismatch", "/evidenceDigest");
  }
  return { ok: true, value: evidence };
};

const expectedObservation = (
  disposition: IntegrationManifest["operations"][number]["disposition"],
): Pick<NativeObservation, "outcome" | "basis"> =>
  disposition === "supported"
    ? { outcome: "observed-supported", basis: "execution" }
    : disposition === "unsupported"
      ? { outcome: "observed-unsupported", basis: "pinned-source" }
      : { outcome: "observed-not-applicable", basis: "pinned-source" };

export const validateQualificationSubject = (
  evidence: QualificationEvidence,
  manifest: IntegrationManifest,
  binding: IntegrationArtifactBinding,
): IntegrationResult<QualificationEvidence> => {
  const observations = new Map(evidence.observations.map((item) => [item.operationId, item]));
  if (observations.size !== evidence.observations.length) {
    return invalid("operation-observation-duplicated", "/observations");
  }
  for (const claim of manifest.operations) {
    const observed = observations.get(claim.operationId);
    const expected = expectedObservation(claim.disposition);
    if (
      observed === undefined ||
      observed.upstreamVersion !== claim.upstreamVersion ||
      observed.outcome !== expected.outcome ||
      observed.basis !== expected.basis
    ) {
      return invalid("operation-claim-not-observed", `/operations/${claim.operationId}`);
    }
  }
  if (
    observations.size !== manifest.operations.length ||
    evidence.integrationName !== manifest.identity.name ||
    evidence.integrationVersion !== manifest.identity.version ||
    !sameDigest(evidence.manifestDigest, integrationContentDigest(manifest)) ||
    !sameDigest(evidence.rootArtifactDigest, binding.rootArtifact.digest) ||
    !sameDigest(evidence.subjectClosureDigest, integrationClosureDigest(binding.executableClosure))
  ) {
    return invalid("qualification-subject-mismatch");
  }
  return { ok: true, value: evidence };
};
