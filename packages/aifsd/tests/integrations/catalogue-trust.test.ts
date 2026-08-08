import { describe, expect, test } from "bun:test";
import * as integrations from "../../src/integrations/index.js";
import {
  activateIntegration,
  createActivationGrant,
  createCatalogMetadata,
  qualifyIntegration,
  resolveIntegrationMetadata,
  resolveLocalIntegrationMetadata,
  validateQualificationEvidence,
  verifyIntegrationAcquisition,
  type PublicationAdmission,
  type PublicationAuthority,
  type QualificationEvidence,
} from "../../src/integrations/index.js";
import {
  integrationClosureDigest,
  integrationContentDigest,
} from "../../src/integrations/content-identity.js";
import { createIntegrationTrustService } from "../../src/integrations/trust-host.js";
import {
  acquisitionObservation,
  manifest,
  qualificationAuthority,
  qualificationService,
  release,
  sha,
} from "./fixtures/integration.js";

const publicationAuthority = (accepted = true): PublicationAuthority => ({
  authorityId: "test.publication-authority",
  verify: ({ signature }) => accepted && signature === "test-authorised-signature",
});

const trustService = (qualificationAccepted = true, publicationAccepted = true) =>
  createIntegrationTrustService(
    qualificationAuthority(qualificationAccepted),
    publicationAuthority(publicationAccepted),
  );

const acquiredFixture = () => {
  const resolved = resolveLocalIntegrationMetadata({
    releases: [release(integrationContentDigest(manifest))],
    name: manifest.identity.name,
    version: manifest.identity.version,
  });
  if (!resolved.ok) throw new Error("fixture resolution failed");
  const acquired = verifyIntegrationAcquisition(
    resolved.value,
    acquisitionObservation,
    "2026-08-08T00:00:00Z",
  );
  if (!acquired.ok) throw new Error("fixture acquisition failed");
  return acquired.value;
};

const qualifiedFixture = async () => {
  const acquisition = acquiredFixture();
  const qualification = await qualifyIntegration(
    {
      acquisition,
      suiteDigest: sha("suite"),
      qualifiedAt: "2026-08-08T00:01:00Z",
    },
    qualificationService(),
    "test-executor-admission",
  );
  if (!qualification.ok) throw new Error("fixture qualification failed");
  return { acquisition, qualification: qualification.value };
};

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

const publicationRequest = (qualification: QualificationEvidence) => ({
  manifest,
  rootArtifact: acquisitionObservation.rootArtifact,
  executableClosure: acquisitionObservation.executableClosure,
  qualification,
  admission: admissionFor(qualification, "official"),
});

describe("integration catalogue trust", () => {
  test("keeps host capability factories outside the public integration front", () => {
    expect("createQualificationService" in integrations).toBe(false);
    expect("createIntegrationTrustService" in integrations).toBe(false);
  });

  test("rejects evidence produced outside its executor admission interval", async () => {
    const { qualification } = await qualifiedFixture();
    const { evidenceDigest: _evidenceDigest, ...base } = qualification;
    void _evidenceDigest;
    const expiredBase = {
      ...base,
      executorAdmission: {
        ...qualification.executorAdmission,
        expiresAt: "2026-08-08T00:00:30Z",
      },
    };
    expect(
      validateQualificationEvidence({
        ...expiredBase,
        evidenceDigest: integrationContentDigest(expiredBase),
      }).ok,
    ).toBe(false);
  });

  test("resolves only an intact and currently admitted catalogue projection", async () => {
    const { qualification } = await qualifiedFixture();
    const metadata = await createCatalogMetadata(publicationRequest(qualification), trustService());
    expect(metadata.ok).toBe(true);
    if (!metadata.ok) throw new Error("fixture publication failed");

    const trusted = await resolveIntegrationMetadata(
      {
        releases: [metadata.value],
        name: manifest.identity.name,
        version: manifest.identity.version,
      },
      trustService(),
    );
    expect(trusted.ok).toBe(true);
    if (trusted.ok) expect(trusted.value.trust).toBe("official");

    const fabricated = await resolveIntegrationMetadata(
      {
        releases: [{ ...release(integrationContentDigest(manifest)), trust: "official" }],
        name: manifest.identity.name,
        version: manifest.identity.version,
      },
      trustService(),
    );
    expect(fabricated.ok).toBe(false);

    const changedRoot = {
      ...metadata.value.rootArtifact,
      digest: sha("changed-after-publication"),
    };
    const changedClosure = {
      ...metadata.value.executableClosure,
      root: changedRoot,
      representation: {
        kind: "members" as const,
        members: [
          changedRoot,
          {
            id: "native-upstream",
            version: "2.19.0",
            digest: sha("dependency"),
          },
        ],
      },
    };
    const { metadataDigest: _metadataDigest, ...metadataBase } = metadata.value;
    void _metadataDigest;
    const changedBase = {
      ...metadataBase,
      rootArtifact: changedRoot,
      executableClosure: changedClosure,
    };
    const rebound = await resolveIntegrationMetadata(
      {
        releases: [{ ...changedBase, metadataDigest: integrationContentDigest(changedBase) }],
        name: manifest.identity.name,
        version: manifest.identity.version,
      },
      trustService(),
    );
    expect(rebound.ok).toBe(false);
  });

  test("reverifies recorded executor admission before publication and activation", async () => {
    const { acquisition, qualification } = await qualifiedFixture();
    const deniedPublication = await createCatalogMetadata(
      publicationRequest(qualification),
      trustService(false),
    );
    expect(deniedPublication.ok).toBe(false);

    const grant = createActivationGrant({
      grantId: "denied-grant",
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
    const deniedActivation = await activateIntegration(
      { acquisition, qualification, grant, now: "2026-08-08T00:30:00Z" },
      {
        workerId: "isolated-worker-1",
        activate: () => {
          calls += 1;
          return {
            grantId: grant.grantId,
            operation: grant.operation,
            workerId: grant.workerId,
            nativeResult: { status: "unexpected" },
          };
        },
      },
      trustService(false),
    );
    expect(deniedActivation.ok).toBe(false);
    expect(calls).toBe(0);
  });

  test("retains a closed request and exact worker across asynchronous authorisation", async () => {
    const { acquisition, qualification } = await qualifiedFixture();
    const grant = createActivationGrant({
      grantId: "async-grant",
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
    let approve: ((accepted: boolean) => void) | undefined;
    const service = createIntegrationTrustService(
      {
        authorityId: "test.qualification-authority",
        verify: () =>
          new Promise<boolean>((resolve) => {
            approve = resolve;
          }),
      },
      publicationAuthority(),
    );
    const request = {
      acquisition,
      qualification,
      grant,
      now: "2026-08-08T00:30:00Z",
    };
    let observedOperation = "";
    let replacementCalls = 0;
    class StatefulWorker {
      readonly #state = "private-worker-state";
      workerId = "isolated-worker-1";

      activate(validated: typeof request) {
        observedOperation = validated.grant.operation;
        expect(this.#state).toBe("private-worker-state");
        expect(Object.isFrozen(validated)).toBe(true);
        return {
          grantId: validated.grant.grantId,
          operation: validated.grant.operation,
          workerId: "isolated-worker-1",
          nativeResult: { status: "ok" },
        };
      }
    }
    const worker = new StatefulWorker();
    const pending = activateIntegration(request, worker, service);
    request.grant = { ...grant, operation: "native.a2a-server" };
    worker.workerId = "mutated-worker";
    worker.activate = (mutated: typeof request) => {
      replacementCalls += 1;
      return {
        grantId: mutated.grant.grantId,
        operation: mutated.grant.operation,
        workerId: "isolated-worker-1",
        nativeResult: { status: "mutated" },
      };
    };
    if (approve === undefined) throw new Error("authority verification did not start");
    approve(true);
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(observedOperation).toBe("native.typed-agent-run");
    expect(replacementCalls).toBe(0);
  });
});
