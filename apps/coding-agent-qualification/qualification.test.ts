import { describe, expect, test } from "bun:test";
import {
  OPENHANDS_CODING_AGENT_OPERATIONS,
  projectOpenHandsRepositoryChangeEvidence,
} from "../../packages/llm-core/src/adapters/coding-agent/public";
import { executeOpenHandsQualification } from "./qualification/executor";

const applicationRoot = import.meta.dir;

describe("OpenHands coding-agent qualification", () => {
  test("projects-governed-repository-change-evidence", async () => {
    const python = Bun.env.OPENHANDS_QUALIFICATION_PYTHON;
    if (!python) {
      throw new Error(
        "OPENHANDS_QUALIFICATION_PYTHON must name the exact locked qualification interpreter.",
      );
    }
    const probe = await executeOpenHandsQualification({
      python,
      probe: `${applicationRoot}/qualification/native-probe.py`,
      lock: `${applicationRoot}/uv.lock`,
    });

    expect(probe.exitCode).toBe(0);
    expect(probe.stderr).toBe("");
    expect(probe.timedOut).toBe(false);
    expect(probe.timeoutDiagnostic).toBeNull();
    const evidence = projectOpenHandsRepositoryChangeEvidence(JSON.parse(probe.stdout));

    expect(evidence).toMatchObject({
      schemaVersion: "1.0.0",
      integration: {
        name: "OpenHands Software Agent SDK",
        version: "1.37.1",
        revision: "310989d306114efd0fcadbcbed9ff9c21d4a5963",
      },
      fixtureId: "governed-repository-change-v1",
      workspaceKind: "openhands-local",
      rawNativePayloadIncluded: false,
      sandbox: {
        executor: "macos-sandbox-exec",
        ambientEnvironmentInherited: false,
        credentialEnvironmentAbsent: true,
        deniedFileReadObserved: true,
        deniedFileWriteObserved: true,
        deniedNetworkObserved: true,
      },
    });
    expect(evidence.artifacts.map(({ kind }) => kind)).toEqual([
      "repository-file-before",
      "repository-file-after",
      "repository-patch",
    ]);
    expect(evidence.nativeEvents.map(({ source }) => source)).toEqual(["user", "agent"]);
    expect(JSON.stringify(evidence)).not.toContain("Apply the governed repository change");
    expect(
      OPENHANDS_CODING_AGENT_OPERATIONS.filter(({ disposition }) => disposition === "supported"),
    ).toHaveLength(3);
  }, 30_000);

  test("terminates a probe that exceeds its execution deadline", async () => {
    const python = Bun.env.OPENHANDS_QUALIFICATION_PYTHON;
    if (!python) {
      throw new Error(
        "OPENHANDS_QUALIFICATION_PYTHON must name the exact locked qualification interpreter.",
      );
    }
    const timeoutMs = 100;
    const startedAt = performance.now();
    const probe = await executeOpenHandsQualification({
      python,
      probe: `${applicationRoot}/qualification/blocking-probe.py`,
      lock: `${applicationRoot}/uv.lock`,
      timeoutMs,
    });

    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(probe.exitCode).not.toBe(0);
    expect(probe.signalCode).toBe("SIGKILL");
    expect(probe.stdout).toBe("");
    expect(probe.timedOut).toBe(true);
    expect(probe.timeoutDiagnostic).toBe(
      "OpenHands qualification exceeded its 100 ms execution deadline.",
    );
  });
});
