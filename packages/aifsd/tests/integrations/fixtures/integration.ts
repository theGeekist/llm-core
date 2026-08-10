import { createHash } from "node:crypto";
import { digest, type EvidenceRef } from "@aifsd/llm-core/contracts";
import type {
  AcquisitionObservation,
  LocalIntegrationRelease,
  IntegrationManifest,
  NativeObservation,
  QualificationBoundaryEvidence,
  QualificationExecutor,
  QualificationExecutorAuthority,
  QualificationService,
  QualificationRequest,
} from "../../../src/integrations/index.js";
import {
  integrationClosureDigest,
  integrationContentDigest,
} from "../../../src/integrations/index.js";
import { createQualificationService } from "../../../src/integrations/qualification-host.js";

export const sha = (value: string) =>
  digest(createHash("sha256").update(value, "utf8").digest("hex"));

const root = { id: "@example/native-integration", version: "1.0.0", digest: sha("root") };
const dependency = { id: "native-upstream", version: "2.19.0", digest: sha("dependency") };

export const manifest: IntegrationManifest = {
  schemaVersion: "1.0.0",
  identity: {
    name: "@example/native-integration",
    version: "1.0.0",
    publisher: "example",
    license: "MIT",
  },
  integrationClass: "runtime",
  capabilities: ["runtime.agent"],
  upstreams: [
    {
      name: "PydanticAI",
      version: "2.19.0",
      source: "https://github.com/pydantic/pydantic-ai",
      revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
    },
  ],
  operations: [
    {
      operationId: "native.typed-agent-run",
      disposition: "supported",
      upstream: "PydanticAI",
      upstreamVersion: "2.19.0",
    },
    {
      operationId: "native.a2a-server",
      disposition: "not-applicable",
      upstream: "PydanticAI",
      upstreamVersion: "2.19.0",
    },
  ],
  entrypoints: {
    metadata: "./integration/manifest.json",
    qualification: "./qualification/native-probe.py",
    native: "./src/index.ts",
  },
  permissions: {
    filesystem: [],
    process: ["python"],
    network: [],
    effects: ["model-invocation"],
    secretSlots: ["modelCredential"],
  },
};

const evidence = (seed: string): EvidenceRef =>
  ({
    evidenceId: "01910c84-6c2f-7b90-8000-000000000001",
    kind: "evaluation",
    content: {
      resourceId: "01910c84-6c2f-7b90-8000-000000000002",
      mediaType: "application/json",
      byteLength: seed.length,
      digest: sha(seed),
    },
  }) as EvidenceRef;

export const observations: readonly NativeObservation[] = [
  {
    operationId: "native.typed-agent-run",
    upstreamVersion: "2.19.0",
    outcome: "observed-supported",
    basis: "execution",
    evidence: evidence("run"),
  },
  {
    operationId: "native.a2a-server",
    upstreamVersion: "2.19.0",
    outcome: "observed-not-applicable",
    basis: "pinned-source",
    evidence: evidence("a2a-absent"),
  },
];

export const qualificationExecutor = (
  selectedObservations: readonly NativeObservation[] = observations,
  boundaryPatch: Partial<QualificationBoundaryEvidence> = {},
): QualificationExecutor => ({
  executorId: "test.least-authority-executor",
  workerId: "isolated-worker-1",
  execute: (request: QualificationRequest) => {
    const boundary: QualificationBoundaryEvidence = {
      executorId: "test.least-authority-executor",
      workerId: "isolated-worker-1",
      policyDigest: sha("sandbox-policy"),
      rootArtifactDigest: request.acquisition.rootArtifact.digest,
      subjectClosureDigest: integrationClosureDigest(request.acquisition.executableClosure),
      suiteDigest: request.suiteDigest,
      isolatedWorker: true,
      ambientCredentials: false,
      lifecycleScriptsEnabled: false,
      filesystem: ["package:read", "scratch:write"],
      process: ["python"],
      network: [],
      environmentKeys: ["HOME", "PATH", "PYTHONNOUSERSITE", "TMPDIR"],
      startedAt: "2026-08-08T00:00:00Z",
      completedAt: "2026-08-08T00:00:01Z",
      exitCode: 0,
      evidence: evidence("sandbox-execution"),
      ...boundaryPatch,
    };
    return {
      observations: selectedObservations,
      boundary,
      executionDigest: integrationContentDigest({ observations: selectedObservations, boundary }),
    };
  },
});

export const qualificationService = (
  executor: QualificationExecutor = qualificationExecutor(),
  accepted = true,
): QualificationService => {
  const admission = {
    authorityId: "test.qualification-authority",
    admissionId: "test-executor-admission",
    executorId: executor.executorId,
    workerId: executor.workerId,
    admittedAt: "2026-08-08T00:00:00Z",
    expiresAt: "2026-08-08T01:00:00Z",
    signature: "test-authorised-executor",
  };
  return createQualificationService(qualificationAuthority(accepted), [{ executor, admission }]);
};

export const qualificationAuthority = (accepted = true): QualificationExecutorAuthority => ({
  authorityId: "test.qualification-authority",
  verify: ({ signature }) => accepted && signature === "test-authorised-executor",
});

export const acquisitionObservation: AcquisitionObservation = {
  rootArtifact: root,
  executableClosure: { root, representation: { kind: "members", members: [root, dependency] } },
  lifecycleScriptsEnabled: false,
};

export const release = (manifestDigest: ReturnType<typeof sha>): LocalIntegrationRelease => ({
  source: "local",
  manifest,
  manifestDigest,
  rootArtifact: acquisitionObservation.rootArtifact,
  executableClosure: acquisitionObservation.executableClosure,
});
