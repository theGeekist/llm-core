import { describe, expect, it } from "bun:test";
import type { Runtime } from "#workflow/types";
import { createPauseSessions, type PauseSession } from "#workflow/driver";
import {
  createSnapshotRecorder,
  readSessionStore,
  readSessionTtlMs,
  resolveResumeSession,
} from "#workflow/runtime/resume-session";
import { createResumeSnapshot, createSessionStore, resolveMaybe } from "./helpers";

describe("Workflow resume sessions", () => {
  it("ignores invalid session stores", () => {
    const runtime = {
      resume: {
        resolve: () => ({ input: "ok" }),
        sessionStore: { get: () => undefined },
      },
    } satisfies Runtime;

    expect(readSessionStore(runtime)).toBeUndefined();
  });

  it("reads session stores and ttl values", () => {
    const { sessionStore } = createSessionStore();
    const runtime = {
      resume: {
        resolve: () => ({ input: "ok" }),
        sessionStore,
        sessionTtlMs: 123,
      },
    } satisfies Runtime;

    expect(readSessionStore(runtime)).toBe(sessionStore);
    expect(readSessionTtlMs(runtime)).toBe(123);
    const invalidRuntime = {
      resume: {
        resolve: () => ({ input: "ok" }),
        sessionTtlMs: "x",
      },
    };
    expect(readSessionTtlMs(invalidRuntime)).toBeUndefined();
  });

  it("records pause snapshots when tokens are present", () => {
    const { sessions, sessionStore } = createSessionStore();
    const runtime = {
      resume: {
        resolve: () => ({ input: "ok" }),
        sessionStore,
      },
    } satisfies Runtime;
    const record = createSnapshotRecorder(runtime);

    record({ pauseSnapshot: { step: 1 } });
    expect(sessions.size).toBe(0);

    record({ token: "token-1", pauseKind: "human", pauseSnapshot: { step: 2 } });
    const stored = sessions.get("token-1");
    expect(stored?.payload).toEqual({ step: 2 });
    expect(stored?.pauseKind).toBe("human");
  });

  it("records resume snapshots when pause snapshots are missing", () => {
    const { sessions, sessionStore } = createSessionStore();
    const runtime = {
      resume: {
        resolve: () => ({ input: "ok" }),
        sessionStore,
      },
    } satisfies Runtime;
    const record = createSnapshotRecorder(runtime);

    record({ token: "token-2", resumeSnapshot: { step: 3 } });
    const stored = sessions.get("token-2");
    expect(stored?.payload).toEqual({ step: 3 });
  });

  it("resolves iterator sessions before store snapshots", async () => {
    const { sessionStore } = createSessionStore();
    const runtime = {
      resume: {
        resolve: () => ({ input: "ok" }),
        sessionStore,
      },
    } satisfies Runtime;
    const iterator = [1].values();
    const pauseSession: PauseSession = {
      iterator,
      getDiagnostics: () => [],
      createdAt: Date.now(),
    };
    const resolved = await resolveMaybe(resolveResumeSession("token", pauseSession, runtime));

    expect(resolved.kind).toBe("iterator");
    if (resolved.kind === "iterator") {
      expect(resolved.session).toBe(pauseSession);
      expect(resolved.store).toBe(sessionStore);
    }
  });

  it("resolves snapshots when stored sessions exist", async () => {
    const { sessionStore } = createSessionStore();
    const snapshot = createResumeSnapshot("token-3", { step: 4 });
    const runtime = {
      resume: {
        resolve: () => ({ input: "ok" }),
        sessionStore: {
          ...sessionStore,
          get: () => snapshot,
        },
      },
    } satisfies Runtime;

    const resolved = await resolveMaybe(resolveResumeSession("token-3", undefined, runtime));
    expect(resolved.kind).toBe("snapshot");
    if (resolved.kind === "snapshot") {
      expect(resolved.snapshot).toBe(snapshot);
    }
  });

  it("marks sessions invalid when no store is available", async () => {
    const runtime = { resume: { resolve: () => ({ input: "ok" }) } } satisfies Runtime;
    const resolved = await resolveMaybe(resolveResumeSession("token-4", undefined, runtime));
    expect(resolved.kind).toBe("invalid");
  });

  it("exposes pause sessions storage when needed", () => {
    const sessions = createPauseSessions();
    expect(sessions.size).toBe(0);
  });
});
