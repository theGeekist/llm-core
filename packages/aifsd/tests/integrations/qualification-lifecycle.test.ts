import { describe, expect, test } from "bun:test";
import {
  activateIntegration,
  createActivationGrant,
  createCatalogMetadata,
  qualifyIntegration,
  resolveLocalIntegrationMetadata,
  verifyIntegrationAcquisition,
  type ActivationReceipt,
  type PublicationAdmission,
  type PublicationAuthority,
  type QualificationBoundaryEvidence,
  type QualificationEvidence,
  type QualificationService,
} from "../../src/integrations/index.js";
import {
  integrationClosureDigest,
  integrationContentDigest,
} from "../../src/integrations/content-identity.js";
import { createIntegrationTrustService } from "../../src/integrations/trust-host.js";
import {
  acquisitionObservation,
  manifest,
  observations,
  qualificationExecutor,
  qualificationAuthority,
  qualificationService,
  release,
  sha,
} from "./fixtures/integration.js";

const acquiredFixture = () => {
  const manifestDigest = integrationContentDigest(manifest);
  const resolved = resolveLocalIntegrationMetadata({
    releases: [release(manifestDigest)],
    name: manifest.identity.name,
    version: manifest.identity.version,
  });
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error("fixture resolution failed");
  const acquired = verifyIntegrationAcquisition(
    resolved.value,
    acquisitionObservation,
    "2026-08-08T00:00:00Z",
  );
  expect(acquired.ok).toBe(true);
  if (!acquired.ok) throw new Error("fixture acquisition failed");
  return acquired.value;
};

const qualifiedFixture = async () => {
  const acquisition = acquiredFixture();
  const qualified = await qualifyIntegration(
    {
      acquisition,
      suiteDigest: sha("suite"),
      qualifiedAt: "2026-08-08T00:01:00Z",
    },
    qualificationService(),
    "test-executor-admission",
  );
  expect(qualified.ok).toBe(true);
  if (!qualified.ok) throw new Error("fixture qualification failed");
  return { acquisition, qualification: qualified.value };
};

const publicationAuthority = (accepted = true): PublicationAuthority => ({
  authorityId: "test.publication-authority",
  verify: ({ signature }) => accepted && signature === "test-authorised-signature",
});

const trustService = (qualificationAccepted = true, publicationAccepted = true) =>
  createIntegrationTrustService(
    qualificationAuthority(qualificationAccepted),
    publicationAuthority(publicationAccepted),
  );

const admissionFor = (
  qualification: QualificationEvidence,
  trust: PublicationAdmission["trust"] = "community",
): PublicationAdmission => ({
  authorityId: "test.publication-authority",
  decisionId: "publication-decision-1",
  integrationName: manifest.identity.name,
  integrationVersion: manifest.identity.version,
  manifestDigest: qualification.manifestDigest,
  qualificationEvidenceDigest: qualification.evidenceDigest,
  catalogSubjectDigest: integrationContentDigest({
    integrationName: manifest.identity.name,
    integrationVersion: manifest.identity.version,
    manifestDigest: qualification.manifestDigest,
    rootArtifact: acquisitionObservation.rootArtifact,
    subjectClosureDigest: integrationClosureDigest(acquisitionObservation.executableClosure),
    qualificationEvidenceDigest: qualification.evidenceDigest,
    trust,
  }),
  trust,
  decidedAt: "2026-08-08T00:02:00Z",
  signature: "test-authorised-signature",
});

const publicationRequest = (
  qualification: QualificationEvidence,
  admission: PublicationAdmission,
) => ({
  manifest,
  rootArtifact: acquisitionObservation.rootArtifact,
  executableClosure: acquisitionObservation.executableClosure,
  qualification,
  admission,
});

describe("integration lifecycle", () => {
  test("keeps resolution metadata-only and rejects artifact or lifecycle mutation", () => {
    const acquisition = acquiredFixture();
    expect(acquisition.manifest.identity.name).toBe(manifest.identity.name);
    const resolved = resolveLocalIntegrationMetadata({
      releases: [release(integrationContentDigest(manifest))],
      name: manifest.identity.name,
      version: manifest.identity.version,
    });
    if (!resolved.ok) throw new Error("fixture resolution failed");
    expect(
      verifyIntegrationAcquisition(
        resolved.value,
        { ...acquisitionObservation, lifecycleScriptsEnabled: true },
        "now",
      ).ok,
    ).toBe(false);
    expect(
      verifyIntegrationAcquisition(
        resolved.value,
        {
          ...acquisitionObservation,
          executableClosure: {
            ...acquisitionObservation.executableClosure,
            root: { ...acquisitionObservation.executableClosure.root, digest: sha("mutated") },
          },
        },
        "now",
      ).ok,
    ).toBe(false);
    expect(
      verifyIntegrationAcquisition(
        resolved.value,
        {
          ...acquisitionObservation,
          executableClosure: {
            ...acquisitionObservation.executableClosure,
            representation: {
              kind: "members",
              members: [
                acquisitionObservation.rootArtifact,
                {
                  id: "native-upstream",
                  version: "2.19.0",
                  digest: sha("mutated-dependency"),
                },
              ],
            },
          },
        },
        "now",
      ).ok,
    ).toBe(false);
  });

  test("fails when a generated support claim exceeds executor observations", async () => {
    const acquisition = acquiredFixture();
    const result = await qualifyIntegration(
      {
        acquisition,
        suiteDigest: sha("suite"),
        qualifiedAt: "2026-08-08T00:01:00Z",
      },
      qualificationService(qualificationExecutor(observations.slice(1))),
      "test-executor-admission",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe("claim-exceeds-evidence");
  });

  test("admits executor identity independently before execution", async () => {
    const acquisition = acquiredFixture();
    const spoofedService = await qualifyIntegration(
      {
        acquisition,
        suiteDigest: sha("suite"),
        qualifiedAt: "2026-08-08T00:01:00Z",
      },
      { authorityId: "test.qualification-authority" } as QualificationService,
      "test-executor-admission",
    );
    expect(spoofedService.ok).toBe(false);
    if (!spoofedService.ok) {
      expect(spoofedService.diagnostics[0]?.reasonCode).toBe(
        "host-owned-qualification-service-required",
      );
    }
    let calls = 0;
    const executor = qualificationExecutor();
    const result = await qualifyIntegration(
      {
        acquisition,
        suiteDigest: sha("suite"),
        qualifiedAt: "2026-08-08T00:01:00Z",
      },
      qualificationService(
        {
          ...executor,
          execute: (request) => {
            calls += 1;
            return executor.execute(request);
          },
        },
        false,
      ),
      "test-executor-admission",
    );
    expect(result.ok).toBe(false);
    expect(calls).toBe(0);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe("qualification-executor-admission-denied");
    }
  });

  test("rejects a hostile request before invoking the admitted executor", async () => {
    const acquisition = acquiredFixture();
    let getterCalls = 0;
    let executorCalls = 0;
    const hostile: Record<string, unknown> = {
      suiteDigest: sha("suite"),
      qualifiedAt: "2026-08-08T00:01:00Z",
    };
    Object.defineProperty(hostile, "acquisition", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return acquisition;
      },
    });
    const executor = qualificationExecutor();
    const result = await qualifyIntegration(
      hostile,
      qualificationService({
        ...executor,
        execute: (request) => {
          executorCalls += 1;
          return executor.execute(request);
        },
      }),
      "test-executor-admission",
    );
    expect(result.ok).toBe(false);
    expect(getterCalls).toBe(0);
    expect(executorCalls).toBe(0);
  });

  test("rejects executor evidence that reports ambient authority", async () => {
    const acquisition = acquiredFixture();
    const result = await qualifyIntegration(
      {
        acquisition,
        suiteDigest: sha("suite"),
        qualifiedAt: "2026-08-08T00:01:00Z",
      },
      qualificationService(
        qualificationExecutor(observations, {
          ambientCredentials: true,
        } as unknown as Partial<QualificationBoundaryEvidence>),
      ),
      "test-executor-admission",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe("qualification-boundary-invalid");
    }
  });

  test("requires intact qualification evidence and authorised trust admission", async () => {
    const { qualification } = await qualifiedFixture();
    const admission = admissionFor(qualification);
    const left = await createCatalogMetadata(
      publicationRequest(qualification, admission),
      trustService(),
    );
    const right = await createCatalogMetadata(
      publicationRequest(qualification, admission),
      trustService(),
    );
    expect(left).toEqual(right);
    expect(left.ok).toBe(true);

    const forged = {
      ...qualification,
      evidenceDigest: sha("forged-evidence-digest"),
    };
    const forgedResult = await createCatalogMetadata(
      publicationRequest(forged, admissionFor(forged, "official")),
      trustService(),
    );
    expect(forgedResult.ok).toBe(false);

    const observations = qualification.observations.map((observation, index) =>
      index === 0
        ? {
            ...observation,
            outcome: "observed-unsupported" as const,
            basis: "pinned-source" as const,
          }
        : observation,
    );
    const executionDigest = integrationContentDigest({
      observations,
      boundary: qualification.boundary,
    });
    const { evidenceDigest: _evidenceDigest, ...qualificationBase } = qualification;
    void _evidenceDigest;
    const falsifiedBase = { ...qualificationBase, observations, executionDigest };
    const falsified = {
      ...falsifiedBase,
      evidenceDigest: integrationContentDigest(falsifiedBase),
    };
    const falsifiedResult = await createCatalogMetadata(
      publicationRequest(falsified, admissionFor(falsified, "official")),
      trustService(),
    );
    expect(falsifiedResult.ok).toBe(false);

    const denied = await createCatalogMetadata(
      publicationRequest(qualification, admissionFor(qualification, "official")),
      trustService(true, false),
    );
    expect(denied.ok).toBe(false);
  });

  test("binds activation and receipts to the exact worker and grant", async () => {
    const { acquisition, qualification } = await qualifiedFixture();
    const grant = createActivationGrant({
      grantId: "grant-1",
      workerId: "isolated-worker-1",
      acquisition,
      operation: "native.typed-agent-run",
      workspace: "workspace-1",
      filesystem: [],
      process: ["python"],
      network: [],
      effects: ["model-invocation"],
      credentialBindings: {},
      expiresAt: "2026-08-08T01:00:00Z",
    });
    let calls = 0;
    const receipt: ActivationReceipt = {
      grantId: grant.grantId,
      operation: grant.operation,
      workerId: grant.workerId,
      nativeResult: { status: "ok" },
    };
    const worker = {
      workerId: "isolated-worker-1",
      activate: () => {
        calls += 1;
        return receipt;
      },
    };
    const falsifiedObservations = qualification.observations.map((observation, index) =>
      index === 0
        ? {
            ...observation,
            outcome: "observed-unsupported" as const,
            basis: "pinned-source" as const,
          }
        : observation,
    );
    const falsifiedExecutionDigest = integrationContentDigest({
      observations: falsifiedObservations,
      boundary: qualification.boundary,
    });
    const { evidenceDigest: _evidenceDigest, ...qualificationBase } = qualification;
    void _evidenceDigest;
    const falsifiedBase = {
      ...qualificationBase,
      observations: falsifiedObservations,
      executionDigest: falsifiedExecutionDigest,
    };
    const falsifiedQualification = {
      ...falsifiedBase,
      evidenceDigest: integrationContentDigest(falsifiedBase),
    };
    const falsifiedActivation = await activateIntegration(
      {
        acquisition,
        qualification: falsifiedQualification,
        grant,
        now: "2026-08-08T00:30:00Z",
      },
      worker,
      trustService(),
    );
    expect(falsifiedActivation.ok).toBe(false);
    expect(calls).toBe(0);
    const result = await activateIntegration(
      { acquisition, qualification, grant, now: "2026-08-08T00:30:00Z" },
      worker,
      trustService(),
    );
    expect(result.ok).toBe(true);
    expect(calls).toBe(1);

    const unbound = await activateIntegration(
      { acquisition, qualification, grant, now: "2026-08-08T00:30:00Z" },
      { ...worker, workerId: "different-worker" },
      trustService(),
    );
    expect(unbound.ok).toBe(false);
    expect(calls).toBe(1);

    const forgedReceipt = await activateIntegration(
      { acquisition, qualification, grant, now: "2026-08-08T00:30:00Z" },
      {
        workerId: "isolated-worker-1",
        activate: () => ({
          ...receipt,
          grantId: "different-grant",
          operation: "different-operation",
          workerId: "ungranted-worker",
        }),
      },
      trustService(),
    );
    expect(forgedReceipt.ok).toBe(false);

    const stale = await activateIntegration(
      { acquisition, qualification, grant, now: "2026-08-08T02:00:00Z" },
      worker,
      trustService(),
    );
    expect(stale.ok).toBe(false);
    const excessive = await activateIntegration(
      {
        acquisition,
        qualification,
        grant: { ...grant, network: ["ungranted.example"] },
        now: "2026-08-08T00:30:00Z",
      },
      worker,
      trustService(),
    );
    expect(excessive.ok).toBe(false);
  });
});
