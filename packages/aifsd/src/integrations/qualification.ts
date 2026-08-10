import { snapshot } from "@aifsd/strict-json";
import type {
  IntegrationResult,
  MaybePromise,
  NativeObservation,
  OperationClaim,
  QualificationEvidence,
  QualificationExecutor,
  QualificationExecutorAdmission,
  QualificationRequest,
  QualificationService,
} from "./contract.js";
import {
  integrationClosureDigest,
  integrationContentDigest,
  sameDigest,
} from "./content-identity.js";
import {
  validateQualificationExecution,
  validateQualificationExecutorAdmission,
  validateQualificationRequest,
} from "./qualification-validation.js";
import { qualificationServiceState } from "./qualification-host.js";

const expectedObservation = (
  claim: OperationClaim,
): Pick<NativeObservation, "outcome" | "basis"> =>
  claim.disposition === "supported"
    ? { outcome: "observed-supported", basis: "execution" }
    : claim.disposition === "unsupported"
      ? { outcome: "observed-unsupported", basis: "pinned-source" }
      : { outcome: "observed-not-applicable", basis: "pinned-source" };

const failure = (reasonCode: string, path?: string): IntegrationResult<never> => ({
  ok: false,
  diagnostics: [{ code: "claim-exceeds-evidence", reasonCode, ...(path ? { path } : {}) }],
});

const completeQualification = ({
  request,
  executor,
  executorAdmission,
  rawExecution,
}: {
  readonly request: QualificationRequest;
  readonly executor: QualificationExecutor;
  readonly executorAdmission: QualificationExecutorAdmission;
  readonly rawExecution: unknown;
}): IntegrationResult<QualificationEvidence> => {
  const execution = validateQualificationExecution(rawExecution, request, executor);
  if (!execution.ok) return execution;
  const { manifest } = request.acquisition;
  const observations = new Map(
    execution.value.observations.map((item) => [item.operationId, item]),
  );
  if (observations.size !== execution.value.observations.length) {
    return failure("operation-observation-duplicated", "/observations");
  }
  for (const claim of manifest.operations) {
    const observed = observations.get(claim.operationId);
    const expected = expectedObservation(claim);
    if (
      observed === undefined ||
      observed.upstreamVersion !== claim.upstreamVersion ||
      observed.outcome !== expected.outcome ||
      observed.basis !== expected.basis
    ) {
      return failure("operation-claim-not-observed", `/operations/${claim.operationId}`);
    }
  }
  if (observations.size !== manifest.operations.length) {
    return failure("undeclared-operation-observation", "/observations");
  }
  const manifestDigest = integrationContentDigest(manifest);
  if (!sameDigest(manifestDigest, request.acquisition.manifestDigest)) {
    return {
      ok: false,
      diagnostics: [{ code: "subject-mismatch", reasonCode: "manifest-mutated" }],
    };
  }
  const base = {
    status: "qualified" as const,
    integrationName: manifest.identity.name,
    integrationVersion: manifest.identity.version,
    manifestDigest,
    rootArtifactDigest: request.acquisition.rootArtifact.digest,
    subjectClosureDigest: integrationClosureDigest(request.acquisition.executableClosure),
    suiteDigest: request.suiteDigest,
    observations: execution.value.observations,
    boundary: execution.value.boundary,
    executionDigest: execution.value.executionDigest,
    executorId: execution.value.boundary.executorId,
    workerId: execution.value.boundary.workerId,
    executorAdmission,
    qualifiedAt: request.qualifiedAt,
  };
  return {
    ok: true,
    value: snapshot({
      ...base,
      evidenceDigest: integrationContentDigest(base),
    }) as unknown as QualificationEvidence,
  };
};

const isPromiseLike = <T>(value: MaybePromise<T>): value is PromiseLike<T> =>
  (typeof value === "object" || typeof value === "function") && value !== null && "then" in value;

export const qualifyIntegration = (
  input: unknown,
  service: QualificationService,
  admissionId: string,
): MaybePromise<IntegrationResult<QualificationEvidence>> => {
  const request = validateQualificationRequest(input);
  if (!request.ok) return request;
  const state = qualificationServiceState(service);
  if (state === undefined) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "qualification-executor-admission-invalid",
          reasonCode: "host-owned-qualification-service-required",
        },
      ],
    };
  }
  const matches = state.registrations.flatMap((registration) => {
    const admission = validateQualificationExecutorAdmission(registration.admission, {
      executor: registration.executor,
      authority: state.authority,
      at: request.value.qualifiedAt,
    });
    return admission.ok && admission.value.admissionId === admissionId
      ? [{ registration, admission: admission.value }]
      : [];
  });
  if (matches.length !== 1) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "qualification-executor-admission-invalid",
          reasonCode: "executor-registration-not-unique",
        },
      ],
    };
  }
  const selected = matches[0]!;
  const execute = (authorised: boolean): MaybePromise<IntegrationResult<QualificationEvidence>> => {
    if (!authorised) {
      return {
        ok: false,
        diagnostics: [
          {
            code: "qualification-executor-admission-denied",
            reasonCode: "qualification-authority-denied",
          },
        ],
      };
    }
    const execution = selected.registration.executor.execute(request.value);
    return isPromiseLike(execution)
      ? Promise.resolve(execution).then((value) =>
          completeQualification({
            request: request.value,
            executor: selected.registration.executor,
            executorAdmission: selected.admission,
            rawExecution: value,
          }),
        )
      : completeQualification({
          request: request.value,
          executor: selected.registration.executor,
          executorAdmission: selected.admission,
          rawExecution: execution,
        });
  };
  const authorised = state.authority.verify(selected.admission);
  return isPromiseLike(authorised)
    ? Promise.resolve(authorised).then(execute)
    : execute(authorised);
};
