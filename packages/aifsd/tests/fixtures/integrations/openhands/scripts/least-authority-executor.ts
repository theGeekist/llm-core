import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { digest, type Digest, type EvidenceRef } from "@geekist/llm-core/contracts";
import {
  integrationClosureDigest,
  integrationContentDigest,
  type NativeObservation,
  type QualificationExecution,
  type QualificationExecutor,
  type QualificationRequest,
} from "../../../../../src/integrations/index.ts";

const sha = (value: string | Uint8Array): Digest =>
  digest(createHash("sha256").update(value).digest("hex"));

const evidence = (
  evidenceId: EvidenceRef["evidenceId"],
  resourceId: EvidenceRef["content"]["resourceId"],
  bytes: Uint8Array,
): EvidenceRef => ({
  evidenceId,
  kind: "evaluation",
  content: {
    resourceId,
    mediaType: "application/json",
    byteLength: bytes.byteLength,
    digest: sha(bytes),
  },
});

const minimalEnvironment = (scratch: string, packageRoot: string): Record<string, string> => ({
  HOME: scratch,
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
  PYTHONDONTWRITEBYTECODE: "1",
  PYTHONNOUSERSITE: "1",
  PYTHONPATH: join(packageRoot, ".venv", "lib", "python3.12", "site-packages"),
  TMPDIR: scratch,
  UV_CACHE_DIR: join(scratch, "uv-cache"),
});

const sandboxPolicy = ({
  packageRoot,
  scratch,
  python,
  pythonRuntime,
}: {
  readonly packageRoot: string;
  readonly scratch: string;
  readonly python: string;
  readonly pythonRuntime: string;
}): string => `
(version 1)
(deny default)
(allow process-fork)
(allow process-exec (literal "${python}"))
(allow process-exec (literal "${pythonRuntime}"))
(allow file-read*
  (literal "/")
  (subpath "/System")
  (subpath "/usr/lib")
  (subpath "/Library")
  (subpath "/private/etc")
  (subpath "/private/var/db")
  (subpath "/opt/homebrew")
  (subpath "/dev")
  (subpath "${packageRoot}")
  (subpath "${dirname(dirname(pythonRuntime))}"))
(allow file-write* (subpath "${scratch}") (literal "/dev/null"))
(allow sysctl-read)
(allow mach-lookup)
(allow ipc-posix-shm-read-data (literal "apple.shm.notification_center"))
(allow process-info*)
(allow signal (target self))
`;

export const createLeastAuthorityExecutor = (): QualificationExecutor => ({
  executorId: "aifsd.macos-sandbox-exec.v1",
  workerId: "openhands-native-probe",
  execute: async (request: QualificationRequest): Promise<QualificationExecution> => {
    if (process.platform !== "darwin") {
      throw new Error("No supported least-authority qualification executor is available");
    }
    const packageRoot = process.cwd();
    const scratch = mkdtempSync(join(tmpdir(), "aifsd-openhands-sandbox-"));
    const environment = minimalEnvironment(scratch, packageRoot);
    const acquisition = Bun.spawnSync(
      ["uv", "sync", "--locked", "--no-install-project", "--python", "3.12"],
      { cwd: packageRoot, env: environment, stdout: "inherit", stderr: "inherit" },
    );
    if (acquisition.exitCode !== 0) throw new Error("locked dependency acquisition failed");
    const python = join(packageRoot, ".venv", "bin", "python");
    const pythonRuntime = realpathSync(python);
    const policy = sandboxPolicy({ packageRoot, scratch, python, pythonRuntime });
    const startedAt = new Date().toISOString();
    const probe = Bun.spawnSync(
      ["/usr/bin/sandbox-exec", "-p", policy, pythonRuntime, "qualification/native-probe.py"],
      { cwd: packageRoot, env: environment, stdout: "pipe", stderr: "inherit" },
    );
    const completedAt = new Date().toISOString();
    if (probe.exitCode !== 0) throw new Error("sandboxed native OpenHands probe failed");
    const native = JSON.parse(probe.stdout.toString()) as {
      version: string;
      observations: readonly { operationId: string; outcome: NativeObservation["outcome"] }[];
    };
    const sourceBytes = new Uint8Array(
      await Bun.file("qualification/unsupported-evidence.json").arrayBuffer(),
    );
    const source = JSON.parse(new TextDecoder().decode(sourceBytes)) as {
      operationId: string;
      outcome: NativeObservation["outcome"];
      upstreamVersion: string;
    };
    const observations: readonly NativeObservation[] = [
      ...native.observations.map((observation) => ({
        ...observation,
        upstreamVersion: native.version,
        basis: "execution" as const,
        evidence: evidence(
          "0198d6f0-0000-7000-8000-000000000001" as EvidenceRef["evidenceId"],
          "0198d6f0-0000-7000-9000-000000000001" as EvidenceRef["content"]["resourceId"],
          probe.stdout,
        ),
      })),
      {
        operationId: source.operationId,
        upstreamVersion: source.upstreamVersion,
        outcome: source.outcome,
        basis: "pinned-source",
        evidence: evidence(
          "0198d6f0-0000-7000-8000-000000000002" as EvidenceRef["evidenceId"],
          "0198d6f0-0000-7000-9000-000000000002" as EvidenceRef["content"]["resourceId"],
          sourceBytes,
        ),
      },
    ];
    const policyBytes = new TextEncoder().encode(policy);
    const boundary = {
      executorId: "aifsd.macos-sandbox-exec.v1",
      workerId: "openhands-native-probe",
      policyDigest: sha(policyBytes),
      rootArtifactDigest: request.acquisition.rootArtifact.digest,
      subjectClosureDigest: integrationClosureDigest(request.acquisition.executableClosure),
      suiteDigest: request.suiteDigest,
      isolatedWorker: true as const,
      ambientCredentials: false as const,
      lifecycleScriptsEnabled: false as const,
      filesystem: ["package:read", "scratch:write"],
      process: ["python"],
      network: [],
      environmentKeys: Object.keys(environment),
      startedAt,
      completedAt,
      exitCode: 0 as const,
      evidence: evidence(
        "0198d6f0-0000-7000-8000-000000000003" as EvidenceRef["evidenceId"],
        "0198d6f0-0000-7000-9000-000000000003" as EvidenceRef["content"]["resourceId"],
        policyBytes,
      ),
    };
    return {
      observations,
      boundary,
      executionDigest: integrationContentDigest({ observations, boundary }),
    };
  },
});
