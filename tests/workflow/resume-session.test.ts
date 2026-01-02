import { describe, expect, it } from "bun:test";
import type { Runtime } from "#workflow/types";
import { createPauseSessions, type PauseSession } from "#workflow/driver";
import {
  createSnapshotRecorder,
  readSessionStore,
  readSessionTtlMs,
  runSessionStoreSweep,
  resolveResumeSession,
  resolveSessionStore,
} from "#workflow/runtime/resume-session";
import { createResumeSnapshot, createSessionStore, resolveMaybe } from "./helpers";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";

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
    const record = createSnapshotRecorder(sessionStore, runtime);

    record({ pauseSnapshot: { step: 1 } });
    expect(sessions.size).toBe(0);

    record({
      token: "token-1",
      pauseKind: "human",
      pauseSnapshot: { step: 2 },
      resumeKey: "thread-1",
    });
    const stored = sessions.get("token-1");
    expect(stored?.payload).toEqual({ step: 2 });
    expect(stored?.pauseKind).toBe("human");
    expect(stored?.resumeKey).toBe("thread-1");
    expect(sessions.get("thread-1")?.token).toBe("token-1");
  });

  it("records pipeline pause snapshots with stored snapshots", () => {
    const { sessions, sessionStore } = createSessionStore();
    const runtime = {
      resume: {
        resolve: () => ({ input: "ok" }),
        sessionStore,
      },
    } satisfies Runtime;
    const record = createSnapshotRecorder(sessionStore, runtime);
    const snapshot: PipelinePauseSnapshot<unknown> = {
      stageIndex: 1,
      state: { userState: { ok: true } },
      token: "token-pause",
      pauseKind: "external",
      createdAt: Date.now(),
      payload: { step: "paused" },
    };

    record({ __paused: true, snapshot });
    const stored = sessions.get("token-pause");
    expect(stored?.pauseKind).toBe("external");
    expect(stored?.payload).toEqual({ step: "paused" });
    expect(stored?.snapshot).toBe(snapshot);
  });

  it("prefers checkpoint adapters over cache stores", () => {
    const checkpoint = {
      get: () => undefined,
      set: () => null,
      delete: () => null,
    };
    const cache = {
      get: () => null,
      set: () => null,
      delete: () => null,
    };
    const resolved = resolveSessionStore(undefined, { checkpoint, cache });

    expect(resolved).toBe(checkpoint);
  });

  it("runs store sweeps when provided", () => {
    let called = false;
    const sweepStore = () => {
      called = true;
      return null;
    };
    const sessionStore = {
      get: () => undefined,
      set: () => null,
      delete: () => null,
      sweep: sweepStore,
    };

    runSessionStoreSweep(sessionStore);
    expect(called).toBe(true);
  });

  it("records resume snapshots when pause snapshots are missing", () => {
    const { sessions, sessionStore } = createSessionStore();
    const runtime = {
      resume: {
        resolve: () => ({ input: "ok" }),
        sessionStore,
      },
    } satisfies Runtime;
    const record = createSnapshotRecorder(sessionStore, runtime);

    record({ token: "token-2", resumeSnapshot: { step: 3 } });
    const stored = sessions.get("token-2");
    expect(stored?.payload).toEqual({ step: 3 });
  });

  it("resolves pause sessions before store snapshots", async () => {
    const { sessionStore } = createSessionStore();
    const pauseSession: PauseSession = {
      snapshot: {
        stageIndex: 0,
        state: {},
        token: "token",
        createdAt: Date.now(),
      },
      getDiagnostics: () => [],
      createdAt: Date.now(),
    };
    const resolved = await resolveMaybe(
      resolveResumeSession({
        token: "token",
        session: pauseSession,
        store: sessionStore,
      }),
    );

    expect(resolved.kind).toBe("pause");
    if (resolved.kind === "pause") {
      expect(resolved.session).toBe(pauseSession);
      expect(resolved.store).toBe(sessionStore);
    }
  });

  it("resolves snapshots when stored sessions exist", async () => {
    const { sessionStore } = createSessionStore();
    const snapshot = createResumeSnapshot("token-3", { step: 4 });

    const resolved = await resolveMaybe(
      resolveResumeSession({
        token: "token-3",
        store: {
          ...sessionStore,
          get: () => snapshot,
        },
      }),
    );
    expect(resolved.kind).toBe("snapshot");
    if (resolved.kind === "snapshot") {
      expect(resolved.snapshot).toBe(snapshot);
    }
  });

  it("marks sessions invalid when no store is available", async () => {
    const resolved = await resolveMaybe(
      resolveResumeSession({
        token: "token-4",
      }),
    );
    expect(resolved.kind).toBe("invalid");
  });

  it("resolves snapshots using resume keys", async () => {
    const { sessionStore } = createSessionStore();
    const snapshot = createResumeSnapshot("token-7", { step: 5 }, { resumeKey: "thread-7" });
    const resolved = await resolveMaybe(
      resolveResumeSession({
        token: "token-7",
        resumeKey: "thread-7",
        store: {
          ...sessionStore,
          get: (token) => (token === "thread-7" ? snapshot : undefined),
        },
      }),
    );
    expect(resolved.kind).toBe("snapshot");
    if (resolved.kind === "snapshot") {
      expect(resolved.snapshot).toBe(snapshot);
    }
  });

  it("exposes pause sessions storage when needed", () => {
    const sessions = createPauseSessions();
    expect(sessions.size).toBe(0);
  });
});
