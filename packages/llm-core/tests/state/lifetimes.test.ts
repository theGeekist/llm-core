import { describe, expect, test } from "bun:test";
import { contractVersion, digest } from "#contracts";
import {
  createDurableExecutionHandle,
  createLiveContinuation,
  createProviderSessionRef,
  createSnapshot,
  isLiveContinuation,
} from "../../src/features/state/public";
import {
  isRegisteredResumableCheckpoint,
  registerResumableCheckpoint,
} from "../../src/features/state/runtime";
import { COMPATIBILITY, NOW, checkpoint, durableJobId, providerSessionId } from "./helpers";
import * as state from "../../src/features/state/public";

describe("state lifetime boundaries", () => {
  test("keeps checkpoint registration and recognition internal", () => {
    expect(state).not.toHaveProperty("isRegisteredResumableCheckpoint");
    expect(state).not.toHaveProperty("registerRecordedEffect");
    expect(state).not.toHaveProperty("registerResumableCheckpoint");
  });

  test("live continuations are process-local and cannot masquerade as JSON checkpoints", () => {
    const continuation = createLiveContinuation({ socket: new Map([["live", true]]) });

    expect(isLiveContinuation(continuation)).toBe(true);
    expect(() => JSON.stringify(continuation)).toThrow("cannot be serialized");
    expect(() => registerResumableCheckpoint(continuation)).toThrow();
  });

  test("snapshots remain serializable observations without resume registration", () => {
    const source = { messages: ["hello"] };
    const snapshot = createSnapshot({
      snapshotId: "snapshot:conversation:1",
      createdAt: NOW,
      value: source,
    });
    source.messages.push("mutated");

    expect(snapshot.kind).toBe("snapshot");
    expect(snapshot.value).toEqual({ messages: ["hello"] });
    expect(isRegisteredResumableCheckpoint(snapshot)).toBe(false);
    expect(() => registerResumableCheckpoint(snapshot)).toThrow();
  });

  test("durable execution and provider session identities stay operationally distinct", () => {
    const durable = createDurableExecutionHandle({
      kind: "durable-execution-handle",
      durableJobId,
      runtime: COMPATIBILITY.runtime,
      opaqueHandle: "temporal:workflow:123",
    });
    const provider = createProviderSessionRef({
      kind: "provider-session-ref",
      providerId: "openai",
      sessionId: providerSessionId,
    });

    expect(durable.kind).toBe("durable-execution-handle");
    expect(provider.kind).toBe("provider-session-ref");
    expect(() => registerResumableCheckpoint(durable)).toThrow();
    expect(() => registerResumableCheckpoint(provider)).toThrow();
  });

  test("registration clones, validates and freezes portable checkpoints", () => {
    const source = checkpoint({ state: { nested: { value: 1 } } });
    const registered = registerResumableCheckpoint(source);
    (source.state as { nested: { value: number } }).nested.value = 2;

    expect(isRegisteredResumableCheckpoint(registered)).toBe(true);
    expect(registered.state).toEqual({ nested: { value: 1 } });
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.compatibility)).toBe(true);
    expect(() => registerResumableCheckpoint({ ...source, credential: "sk-secret" })).toThrow(
      "valid, closed",
    );
  });

  test("retains a closed portable specification decision binding in checkpoints", () => {
    const specification = {
      recordId: "decision.checkpoint",
      authority: "authority.checkpoint",
      resolvedDigest: digest("a".repeat(64)),
      acceptedScope: ["requirement.checkpoint"],
      policyVersions: [{ policyId: "policy.checkpoint", version: contractVersion("1.0.0") }],
      sources: [
        {
          sourceId: "source.checkpoint",
          revision: "revision.1",
          contentDigest: digest("b".repeat(64)),
        },
      ],
    };
    const registered = registerResumableCheckpoint(checkpoint({ specification }));
    specification.acceptedScope.push("requirement.mutated");

    expect(registered.specification).toEqual({
      ...specification,
      acceptedScope: ["requirement.checkpoint"],
    });
    expect(Object.isFrozen(registered.specification)).toBe(true);
    expect(() =>
      registerResumableCheckpoint(
        checkpoint({ specification: { ...specification, unexpected: true } as never }),
      ),
    ).toThrow("valid, closed");
  });
});
