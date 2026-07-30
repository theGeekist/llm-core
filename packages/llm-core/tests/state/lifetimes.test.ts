import { describe, expect, test } from "bun:test";
import {
  createDurableExecutionHandle,
  createLiveContinuation,
  createProviderSessionRef,
  createSnapshot,
  isLiveContinuation,
  isRegisteredResumableCheckpoint,
  registerResumableCheckpoint,
} from "../../src/features/state/public";
import { COMPATIBILITY, NOW, checkpoint, durableJobId, providerSessionId } from "./helpers";

describe("state lifetime boundaries", () => {
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
});
