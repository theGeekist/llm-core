import { describe, expect, test } from "bun:test";
import {
  CodingAgentQualificationError,
  projectOpenHandsRepositoryChangeEvidence,
} from "../../../src/adapters/coding-agent/public";
import { repositoryChangeObservation } from "./fixture";

describe("OpenHands repository-change evidence projection", () => {
  test("projects only digests, identities and declared permission facts", () => {
    const evidence = projectOpenHandsRepositoryChangeEvidence(repositoryChangeObservation());

    expect(evidence.permissions).toEqual({
      filesystem: ["workspace.read", "workspace.write"],
      process: ["python"],
      network: [],
      effects: ["repository.write"],
    });
    expect(evidence.ownership).toEqual({
      execution: "integration-owned",
      workspace: "integration-owned",
      trajectory: "integration-owned",
      session: "integration-owned",
      portableProjection: "llm-core-owned",
    });
    expect(evidence.artifacts.every(({ digest }) => /^sha256:[a-f0-9]{64}$/.test(digest))).toBe(
      true,
    );
    expect(evidence.nativeEvents.every(({ digest }) => /^sha256:[a-f0-9]{64}$/.test(digest))).toBe(
      true,
    );
    expect(evidence.nativeEvents.map(({ source, role }) => ({ source, role }))).toEqual([
      { source: "user", role: "user" },
      { source: "agent", role: "assistant" },
    ]);
    expect(evidence.executableClosure).toMatchObject({
      installedPackageCount: 125,
      interpreter: { implementation: "CPython", version: "3.12.12" },
      platform: { system: "Darwin", architecture: "arm64" },
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain("qualification pending");
    expect(JSON.stringify(evidence)).not.toContain("qualification complete");
  });

  test("rejects version drift, permission expansion and open records", () => {
    const drifted = repositoryChangeObservation();
    drifted.upstream.version = "1.37.2";
    expect(() => projectOpenHandsRepositoryChangeEvidence(drifted)).toThrow(
      new CodingAgentQualificationError(
        "unsupported-upstream-version",
        "Observation is not from the qualified OpenHands release.",
      ),
    );

    const expanded = repositoryChangeObservation();
    (expanded.permissions.network as string[]).push("internet");
    expect(() => projectOpenHandsRepositoryChangeEvidence(expanded)).toThrow(
      "does not match the qualified grant",
    );

    expect(() =>
      projectOpenHandsRepositoryChangeEvidence({
        ...repositoryChangeObservation(),
        nativeTrajectory: [],
      }),
    ).toThrow("undeclared field");
  });

  test("rejects unsafe paths, inconsistent changes and native event drift", () => {
    const unsafePath = repositoryChangeObservation();
    unsafePath.fixture.relativePath = "../outside.txt";
    expect(() => projectOpenHandsRepositoryChangeEvidence(unsafePath)).toThrow(
      "safe workspace-relative",
    );

    const unchanged = repositoryChangeObservation();
    unchanged.fixture.after = unchanged.fixture.before;
    expect(() => projectOpenHandsRepositoryChangeEvidence(unchanged)).toThrow(
      "does not describe the declared repository change",
    );

    const forgedPatch = repositoryChangeObservation();
    forgedPatch.fixture.patch =
      "--- a/src/message.txt\n+++ b/src/message.txt\n@@ -1 +1 @@\n-unrelated\n+forged\n";
    expect(() => projectOpenHandsRepositoryChangeEvidence(forgedPatch)).toThrow(
      "does not describe the declared repository change",
    );

    const wrongOrder = repositoryChangeObservation();
    wrongOrder.nativeEvents[0]!.source = "agent";
    expect(() => projectOpenHandsRepositoryChangeEvidence(wrongOrder)).toThrow(
      "identity or order is inconsistent",
    );

    const swappedNative = repositoryChangeObservation();
    [swappedNative.nativeEvents[0]!.serialized, swappedNative.nativeEvents[1]!.serialized] = [
      swappedNative.nativeEvents[1]!.serialized,
      swappedNative.nativeEvents[0]!.serialized,
    ];
    expect(() => projectOpenHandsRepositoryChangeEvidence(swappedNative)).toThrow(
      "identity or order is inconsistent",
    );

    const arbitraryText = repositoryChangeObservation();
    const native = JSON.parse(arbitraryText.nativeEvents[0]!.serialized);
    native.llm_message.content[0].text = "tampered";
    arbitraryText.nativeEvents[0]!.serialized = JSON.stringify(native);
    expect(() => projectOpenHandsRepositoryChangeEvidence(arbitraryText)).toThrow(
      "content does not match",
    );
  });

  test("rejects accessors, proxies and cycles before reading attacker values", () => {
    let reads = 0;
    const accessor = repositoryChangeObservation() as Record<string, unknown>;
    Object.defineProperty(accessor, "fixture", {
      enumerable: true,
      get: () => {
        reads += 1;
        return repositoryChangeObservation().fixture;
      },
    });
    expect(() => projectOpenHandsRepositoryChangeEvidence(accessor)).toThrow(
      "accessor or hidden property",
    );
    expect(reads).toBe(0);

    let proxyTraps = 0;
    const proxy = new Proxy(repositoryChangeObservation(), {
      getPrototypeOf: (target) => {
        proxyTraps += 1;
        return Reflect.getPrototypeOf(target);
      },
      ownKeys: () => {
        proxyTraps += 1;
        return [];
      },
    });
    expect(() => projectOpenHandsRepositoryChangeEvidence(proxy)).toThrow(
      "rejected before inspection",
    );
    expect(proxyTraps).toBe(0);

    const nested = repositoryChangeObservation();
    let nestedTraps = 0;
    nested.fixture = new Proxy(nested.fixture, {
      getOwnPropertyDescriptor: (target, key) => {
        nestedTraps += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(() => projectOpenHandsRepositoryChangeEvidence(nested)).toThrow(
      "rejected before inspection",
    );
    expect(nestedTraps).toBe(0);

    const cyclic = repositoryChangeObservation() as Record<string, unknown>;
    cyclic.cycle = cyclic;
    expect(() => projectOpenHandsRepositoryChangeEvidence(cyclic)).toThrow("contains a cycle");
  });

  test("rejects executable closure and sandbox evidence drift", () => {
    const changedLock = repositoryChangeObservation();
    (changedLock.executableClosure as { lockDigest: string }).lockDigest =
      `sha256:${"0".repeat(64)}`;
    expect(() => projectOpenHandsRepositoryChangeEvidence(changedLock)).toThrow(
      "not bound to the pinned executable closure",
    );

    const ambientCredentials = repositoryChangeObservation();
    ambientCredentials.sandbox.credentialEnvironmentAbsent = false;
    expect(() => projectOpenHandsRepositoryChangeEvidence(ambientCredentials)).toThrow(
      "did not prove the declared least-authority sandbox",
    );
  });
});
