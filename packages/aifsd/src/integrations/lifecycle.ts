import { snapshot, StrictJsonError } from "@geekist/strict-json";
import { captureIntegrationWorker } from "./activation-worker.js";
import type {
  AcquiredIntegration,
  AcquisitionObservation,
  ActivationRequest,
  ActivationReceipt,
  CatalogMetadata,
  CatalogPublicationRequest,
  IntegrationMetadataResolutionRequest,
  IntegrationResult,
  IntegrationTrustService,
  IntegrationWorker,
  LocalIntegrationRelease,
  MaybePromise,
  ResolvedIntegrationMetadata,
} from "./contract.js";
import {
  integrationClosureDigest,
  integrationContentDigest,
  sameDigest,
} from "./content-identity.js";
import { validateIntegrationArtifactBinding, validateIntegrationManifest } from "./validation.js";
import { validatePublicationAdmission } from "./publication-validation.js";
import {
  validateQualificationEvidence,
  validateQualificationSubject,
} from "./qualification-validation.js";
import { integrationTrustServiceState } from "./trust-host.js";

const failure = <T>(
  code: Parameters<typeof diagnostic>[0],
  reasonCode: string,
  path?: string,
): IntegrationResult<T> => ({
  ok: false,
  diagnostics: [diagnostic(code, reasonCode, path)],
});

const diagnostic = (
  code:
    | "non-portable-value"
    | "artifact-mismatch"
    | "closure-mismatch"
    | "lifecycle-script-forbidden"
    | "qualification-required"
    | "qualification-executor-admission-invalid"
    | "qualification-executor-admission-denied"
    | "publication-admission-invalid"
    | "publication-admission-denied"
    | "activation-grant-invalid"
    | "activation-grant-stale"
    | "activation-receipt-invalid",
  reasonCode: string,
  path?: string,
) => ({ code, reasonCode, ...(path === undefined ? {} : { path }) }) as const;

const portable = <T>(value: T): T => snapshot(value) as unknown as T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));

const resolutionRequest = (
  input: unknown,
): IntegrationResult<IntegrationMetadataResolutionRequest> => {
  let value: unknown;
  try {
    value = snapshot(input);
  } catch (error) {
    return failure(
      "non-portable-value",
      error instanceof StrictJsonError ? error.code : "inspection-failed",
    );
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, ["releases", "name", "version"]) ||
    !Array.isArray(value.releases) ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    typeof value.version !== "string" ||
    value.version.length === 0
  ) {
    return failure("artifact-mismatch", "closed-catalogue-resolution-request-required");
  }
  return { ok: true, value: value as unknown as IntegrationMetadataResolutionRequest };
};

const coordinateMatches = (candidate: unknown, name: string, version: string): boolean =>
  isRecord(candidate) &&
  isRecord(candidate.manifest) &&
  isRecord(candidate.manifest.identity) &&
  candidate.manifest.identity.name === name &&
  candidate.manifest.identity.version === version;

export const resolveLocalIntegrationMetadata = (
  input: IntegrationMetadataResolutionRequest,
): IntegrationResult<ResolvedIntegrationMetadata> => {
  const request = resolutionRequest(input);
  if (!request.ok) return request;
  const matches = request.value.releases.filter((candidate) =>
    coordinateMatches(candidate, request.value.name, request.value.version),
  );
  if (matches.length !== 1) return failure("artifact-mismatch", "catalog-coordinate-not-unique");
  const [release] = matches;
  if (
    !isRecord(release) ||
    !exactKeys(release, [
      "source",
      "manifest",
      "manifestDigest",
      "rootArtifact",
      "executableClosure",
    ]) ||
    release.source !== "local"
  ) {
    return failure("artifact-mismatch", "closed-local-release-required");
  }
  const local = release as unknown as LocalIntegrationRelease;
  const manifest = validateIntegrationManifest(local.manifest);
  if (!manifest.ok) return manifest;
  const expected = integrationContentDigest(manifest.value);
  if (!sameDigest(expected, local.manifestDigest)) {
    return failure("artifact-mismatch", "manifest-digest-mismatch", "/manifestDigest");
  }
  const binding = validateIntegrationArtifactBinding({
    rootArtifact: local.rootArtifact,
    executableClosure: local.executableClosure,
  });
  if (!binding.ok) return binding;
  return {
    ok: true,
    value: portable({
      manifest: manifest.value,
      manifestDigest: local.manifestDigest,
      rootArtifact: binding.value.rootArtifact,
      executableClosure: binding.value.executableClosure,
      trust: "local",
    }),
  };
};

export const verifyIntegrationAcquisition = (
  resolved: ResolvedIntegrationMetadata,
  observation: AcquisitionObservation,
  acquiredAt: string,
): IntegrationResult<AcquiredIntegration> => {
  if (observation.lifecycleScriptsEnabled) {
    return failure("lifecycle-script-forbidden", "lifecycle-scripts-must-be-disabled");
  }
  if (
    resolved.rootArtifact.id !== observation.rootArtifact.id ||
    resolved.rootArtifact.version !== observation.rootArtifact.version ||
    !sameDigest(resolved.rootArtifact.digest, observation.rootArtifact.digest)
  ) {
    return failure("artifact-mismatch", "root-artifact-mutated");
  }
  if (
    !sameDigest(
      integrationClosureDigest(resolved.executableClosure),
      integrationClosureDigest(observation.executableClosure),
    )
  ) {
    return failure("closure-mismatch", "executable-closure-mutated");
  }
  return { ok: true, value: portable({ ...resolved, acquiredAt }) };
};

export const createCatalogMetadata = (
  input: CatalogPublicationRequest,
  service: IntegrationTrustService,
): MaybePromise<IntegrationResult<CatalogMetadata>> => {
  const state = integrationTrustServiceState(service);
  if (state === undefined) {
    return failure(
      "publication-admission-invalid",
      "host-owned-integration-trust-service-required",
    );
  }
  let request: CatalogPublicationRequest;
  try {
    const value = snapshot(input);
    if (
      !isRecord(value) ||
      !exactKeys(value, [
        "manifest",
        "rootArtifact",
        "executableClosure",
        "qualification",
        "admission",
      ])
    ) {
      return failure("publication-admission-invalid", "closed-publication-request-required");
    }
    request = value as unknown as CatalogPublicationRequest;
  } catch (error) {
    return failure(
      "non-portable-value",
      error instanceof StrictJsonError ? error.code : "inspection-failed",
    );
  }
  const manifest = validateIntegrationManifest(request.manifest);
  if (!manifest.ok) return manifest;
  const binding = validateIntegrationArtifactBinding({
    rootArtifact: request.rootArtifact,
    executableClosure: request.executableClosure,
  });
  if (!binding.ok) return binding;
  const qualification = validateQualificationEvidence(request.qualification);
  if (!qualification.ok) return qualification;
  const qualificationSubject = validateQualificationSubject(
    qualification.value,
    manifest.value,
    binding.value,
  );
  if (!qualificationSubject.ok) return qualificationSubject;
  const admission = validatePublicationAdmission(request.admission, state.publicationAuthority);
  if (!admission.ok) return admission;
  const manifestDigest = integrationContentDigest(manifest.value);
  const catalogSubjectDigest = integrationContentDigest({
    integrationName: manifest.value.identity.name,
    integrationVersion: manifest.value.identity.version,
    manifestDigest,
    rootArtifact: binding.value.rootArtifact,
    subjectClosureDigest: integrationClosureDigest(binding.value.executableClosure),
    qualificationEvidenceDigest: qualification.value.evidenceDigest,
    trust: admission.value.trust,
  });
  if (
    admission.value.integrationName !== manifest.value.identity.name ||
    admission.value.integrationVersion !== manifest.value.identity.version ||
    !sameDigest(admission.value.manifestDigest, manifestDigest) ||
    !sameDigest(admission.value.qualificationEvidenceDigest, qualification.value.evidenceDigest) ||
    !sameDigest(admission.value.catalogSubjectDigest, catalogSubjectDigest)
  ) {
    return failure("qualification-required", "qualification-subject-mismatch");
  }
  const complete = (): IntegrationResult<CatalogMetadata> => {
    const base = {
      manifest: manifest.value,
      manifestDigest,
      rootArtifact: binding.value.rootArtifact,
      executableClosure: binding.value.executableClosure,
      qualification: qualification.value,
      admission: admission.value,
      trust: admission.value.trust,
    };
    return {
      ok: true,
      value: portable({ ...base, metadataDigest: integrationContentDigest(base) }),
    };
  };
  const verifyPublication = (
    qualificationAuthorised: boolean,
  ): MaybePromise<IntegrationResult<CatalogMetadata>> => {
    if (!qualificationAuthorised) {
      return failure("qualification-executor-admission-denied", "qualification-authority-denied");
    }
    const authorised = state.publicationAuthority.verify(admission.value);
    const finish = (accepted: boolean) =>
      accepted
        ? complete()
        : failure<CatalogMetadata>("publication-admission-denied", "publication-authority-denied");
    return isPromiseLike(authorised)
      ? Promise.resolve(authorised).then(finish)
      : finish(authorised);
  };
  if (
    qualification.value.executorAdmission.authorityId !== state.qualificationAuthority.authorityId
  ) {
    return failure("qualification-executor-admission-invalid", "qualification-authority-mismatch");
  }
  const qualificationAuthorised = state.qualificationAuthority.verify(
    qualification.value.executorAdmission,
  );
  return isPromiseLike(qualificationAuthorised)
    ? Promise.resolve(qualificationAuthorised).then(verifyPublication)
    : verifyPublication(qualificationAuthorised);
};

export const resolveIntegrationMetadata = (
  input: IntegrationMetadataResolutionRequest,
  service: IntegrationTrustService,
): MaybePromise<IntegrationResult<ResolvedIntegrationMetadata>> => {
  const request = resolutionRequest(input);
  if (!request.ok) return request;
  const matches = request.value.releases.filter((candidate) =>
    coordinateMatches(candidate, request.value.name, request.value.version),
  );
  if (matches.length !== 1) return failure("artifact-mismatch", "catalog-coordinate-not-unique");
  const [candidate] = matches;
  if (
    !isRecord(candidate) ||
    !exactKeys(candidate, [
      "manifest",
      "manifestDigest",
      "rootArtifact",
      "executableClosure",
      "qualification",
      "admission",
      "trust",
      "metadataDigest",
    ])
  ) {
    return failure("artifact-mismatch", "closed-catalogue-projection-required");
  }
  const supplied = candidate as unknown as CatalogMetadata;
  const rebuilt = createCatalogMetadata(
    {
      manifest: supplied.manifest,
      rootArtifact: supplied.rootArtifact,
      executableClosure: supplied.executableClosure,
      qualification: supplied.qualification,
      admission: supplied.admission,
    },
    service,
  );
  const finish = (
    result: IntegrationResult<CatalogMetadata>,
  ): IntegrationResult<ResolvedIntegrationMetadata> => {
    if (!result.ok) return result;
    if (
      supplied.trust !== result.value.trust ||
      !sameDigest(supplied.manifestDigest, result.value.manifestDigest) ||
      !sameDigest(supplied.metadataDigest, result.value.metadataDigest)
    ) {
      return failure("artifact-mismatch", "catalogue-projection-digest-mismatch");
    }
    return {
      ok: true,
      value: portable({
        manifest: result.value.manifest,
        manifestDigest: result.value.manifestDigest,
        rootArtifact: result.value.rootArtifact,
        executableClosure: result.value.executableClosure,
        trust: result.value.trust,
      }),
    };
  };
  return isPromiseLike(rebuilt) ? Promise.resolve(rebuilt).then(finish) : finish(rebuilt);
};

const validateActivation = (
  request: ActivationRequest,
  worker: IntegrationWorker,
): IntegrationResult<ActivationRequest> => {
  const { acquisition, qualification, grant } = request;
  const validQualification = validateQualificationEvidence(qualification);
  if (!validQualification.ok) return validQualification;
  const validQualificationSubject = validateQualificationSubject(
    validQualification.value,
    acquisition.manifest,
    {
      rootArtifact: acquisition.rootArtifact,
      executableClosure: acquisition.executableClosure,
    },
  );
  if (!validQualificationSubject.ok) return validQualificationSubject;
  const now = Date.parse(request.now);
  const expiresAt = Date.parse(grant.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || now >= expiresAt) {
    return failure("activation-grant-stale", "grant-expired");
  }
  const permissions = acquisition.manifest.permissions;
  const within = (requested: readonly string[], allowed: readonly string[]) =>
    requested.every((item) => allowed.includes(item));
  if (
    grant.integrationName !== acquisition.manifest.identity.name ||
    grant.workerId !== worker.workerId ||
    grant.integrationVersion !== acquisition.manifest.identity.version ||
    !sameDigest(grant.rootArtifactDigest, acquisition.rootArtifact.digest) ||
    !sameDigest(
      grant.subjectClosureDigest,
      integrationClosureDigest(acquisition.executableClosure),
    ) ||
    qualification.integrationName !== acquisition.manifest.identity.name ||
    qualification.integrationVersion !== acquisition.manifest.identity.version ||
    !sameDigest(qualification.manifestDigest, acquisition.manifestDigest) ||
    !sameDigest(qualification.rootArtifactDigest, acquisition.rootArtifact.digest) ||
    !sameDigest(qualification.subjectClosureDigest, grant.subjectClosureDigest) ||
    !within(grant.filesystem, permissions.filesystem) ||
    !within(grant.process, permissions.process) ||
    !within(grant.network, permissions.network) ||
    !within(grant.effects, permissions.effects) ||
    !Object.keys(grant.credentialBindings).every((slot) =>
      permissions.secretSlots.includes(slot),
    ) ||
    !acquisition.manifest.operations.some(
      ({ operationId, disposition }) =>
        operationId === grant.operation && disposition === "supported",
    )
  ) {
    return failure("activation-grant-invalid", "grant-subject-or-operation-mismatch");
  }
  return { ok: true, value: request };
};

export const activateIntegration = (
  request: ActivationRequest,
  worker: IntegrationWorker,
  service: IntegrationTrustService,
): MaybePromise<IntegrationResult<ActivationReceipt>> => {
  let closedRequest: ActivationRequest;
  try {
    closedRequest = portable(request);
  } catch (error) {
    return failure(
      "non-portable-value",
      error instanceof StrictJsonError ? error.code : "activation-request-not-portable",
    );
  }
  const capturedWorker = captureIntegrationWorker(worker);
  if (!capturedWorker.ok) return capturedWorker;
  const state = integrationTrustServiceState(service);
  if (state === undefined) {
    return failure(
      "qualification-executor-admission-invalid",
      "host-owned-integration-trust-service-required",
    );
  }
  const valid = validateActivation(closedRequest, capturedWorker.value);
  if (!valid.ok) return valid;
  const validateReceipt = (input: unknown): IntegrationResult<ActivationReceipt> => {
    let receipt: ActivationReceipt;
    try {
      receipt = portable(input) as ActivationReceipt;
    } catch (error) {
      return failure(
        "activation-receipt-invalid",
        error instanceof StrictJsonError ? error.code : "receipt-not-portable",
      );
    }
    if (
      typeof receipt !== "object" ||
      receipt === null ||
      Object.keys(receipt).length !== 4 ||
      !["grantId", "operation", "workerId", "nativeResult"].every((key) =>
        Object.hasOwn(receipt, key),
      ) ||
      receipt.grantId !== valid.value.grant.grantId ||
      receipt.operation !== valid.value.grant.operation ||
      receipt.workerId !== valid.value.grant.workerId
    ) {
      return failure("activation-receipt-invalid", "receipt-grant-or-worker-mismatch");
    }
    return { ok: true, value: receipt };
  };
  const activate = (authorised: boolean): MaybePromise<IntegrationResult<ActivationReceipt>> => {
    if (!authorised) {
      return failure("qualification-executor-admission-denied", "qualification-authority-denied");
    }
    const activated = capturedWorker.value.activate(valid.value);
    return isPromiseLike(activated)
      ? Promise.resolve(activated).then(validateReceipt)
      : validateReceipt(activated);
  };
  if (
    valid.value.qualification.executorAdmission.authorityId !==
    state.qualificationAuthority.authorityId
  ) {
    return failure("qualification-executor-admission-invalid", "qualification-authority-mismatch");
  }
  const authorised = state.qualificationAuthority.verify(
    valid.value.qualification.executorAdmission,
  );
  return isPromiseLike(authorised)
    ? Promise.resolve(authorised).then(activate)
    : activate(authorised);
};

const isPromiseLike = <T>(value: MaybePromise<T>): value is PromiseLike<T> =>
  (typeof value === "object" || typeof value === "function") && value !== null && "then" in value;
