import { createHash } from "node:crypto";
import { digest } from "@aifsd/llm-core/contracts";
import {
  integrationContentDigest,
  qualifyIntegration,
  resolveLocalIntegrationMetadata,
  verifyIntegrationAcquisition,
} from "../../../../../src/integrations/index.ts";
import { createQualificationService } from "../../../../../src/integrations/qualification-host.ts";
import { createLeastAuthorityExecutor } from "./least-authority-executor.js";
import { createPackedArtifact } from "./pack-artifact.js";

const artifact = await createPackedArtifact();
const lockBytes = new Uint8Array(await Bun.file("uv.lock").arrayBuffer());
const closureLock = digest(createHash("sha256").update(lockBytes).digest("hex"));
const manifest = await Bun.file("integration/manifest.json").json();
const rootArtifact = {
  id: "aifsd-fixture-pydantic-ai",
  version: "0.0.0",
  digest: artifact.digest,
};
const executableClosure = {
  root: rootArtifact,
  representation: { kind: "package-lock" as const, lockDigest: closureLock },
};
const manifestDigest = integrationContentDigest(manifest);
const resolved = resolveLocalIntegrationMetadata({
  releases: [{ source: "local", manifest, manifestDigest, rootArtifact, executableClosure }],
  name: manifest.identity.name,
  version: manifest.identity.version,
});
if (!resolved.ok) throw new Error(JSON.stringify(resolved.diagnostics));
const acquired = verifyIntegrationAcquisition(
  resolved.value,
  {
    rootArtifact,
    executableClosure,
    lifecycleScriptsEnabled: false,
  },
  new Date().toISOString(),
);
if (!acquired.ok) throw new Error(JSON.stringify(acquired.diagnostics));
const suiteBytes = new Uint8Array(
  await new Blob([
    await Bun.file("qualification/native-probe.py").arrayBuffer(),
    await Bun.file("qualification/unsupported-evidence.json").arrayBuffer(),
  ]).arrayBuffer(),
);
const suiteDigest = digest(createHash("sha256").update(suiteBytes).digest("hex"));
const request = {
  acquisition: acquired.value,
  suiteDigest,
  qualifiedAt: new Date().toISOString(),
};
const executor = createLeastAuthorityExecutor();
const admission = {
  authorityId: "aifsd.fixture-host",
  admissionId: "pydantic-ai-macos-executor",
  executorId: executor.executorId,
  workerId: executor.workerId,
  admittedAt: "2026-08-08T00:00:00Z",
  expiresAt: "2030-01-01T00:00:00Z",
  signature: "fixture-host-authorised",
};
const service = createQualificationService(
  {
    authorityId: admission.authorityId,
    verify: (candidate) => candidate.signature === "fixture-host-authorised",
  },
  [{ executor, admission }],
);
const qualified = await qualifyIntegration(request, service, admission.admissionId);
if (!qualified.ok) throw new Error(JSON.stringify(qualified.diagnostics));
if (qualified.value.observations.length !== manifest.operations.length) {
  throw new Error("native and pinned-source observation set is incomplete");
}
console.log(
  JSON.stringify({
    status: qualified.value.status,
    version: "2.19.0",
    artifactPath: artifact.path,
    artifactDigest: artifact.digest,
    closureLock,
    evidenceDigest: qualified.value.evidenceDigest,
    executorId: qualified.value.executorId,
  }),
);
