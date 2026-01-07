import { describe, expect, it } from "bun:test";
import {
  readPauseKindFromSession,
  readResumeTokenFromSession,
  readResumeTokenInput,
} from "../../src/workflow/runtime/resume-helpers";
import type { PauseSession } from "../../src/workflow/driver/types";
import type { ResumeSession } from "../../src/workflow/runtime/resume-session";
import type { PauseKind } from "../../src/adapters/types";

const createPauseSession = (token: string, pauseKind?: PauseKind): PauseSession => ({
  snapshot: {
    token,
    pauseKind: pauseKind ?? undefined,
    payload: null,
    createdAt: 1,
    stageIndex: 0,
    state: {},
  },
  getDiagnostics: () => [],
  createdAt: 1,
});

describe("workflow resume helpers", () => {
  it("reads resume token inputs from envelopes", () => {
    expect(readResumeTokenInput("token")).toEqual({ token: "token" });
    expect(readResumeTokenInput({ resumeKey: "rk", token: "t" })).toEqual({
      token: "t",
      resumeKey: "rk",
    });
    expect(readResumeTokenInput({ resumeKey: 123, token: "t" })).toEqual({ token: "t" });
    const envelope = { resumeKey: "rk" };
    expect(readResumeTokenInput(envelope)).toEqual({ token: envelope, resumeKey: "rk" });
  });

  it("reads resume tokens from sessions", () => {
    const pauseSession: ResumeSession = { kind: "pause", session: createPauseSession("pause") };
    const snapshotSession: ResumeSession = {
      kind: "snapshot",
      snapshot: {
        token: "snapshot",
        resumeKey: null,
        pauseKind: null,
        createdAt: 1,
        lastAccessedAt: 1,
        payload: null,
      },
      store: {
        get: () => null,
        set: () => null,
        delete: () => null,
      },
    };
    const invalidSession: ResumeSession = { kind: "invalid" };
    expect(readResumeTokenFromSession(pauseSession, "fallback")).toBe("pause");
    expect(readResumeTokenFromSession(snapshotSession, "fallback")).toBe("snapshot");
    expect(readResumeTokenFromSession(invalidSession, "fallback")).toBe("fallback");
  });

  it("reads pause kinds from sessions", () => {
    const pauseSession = { kind: "pause", session: createPauseSession("pause", "human") } as const;
    const snapshotSession = {
      kind: "snapshot",
      snapshot: {
        token: "snapshot",
        resumeKey: null,
        pauseKind: "external",
        createdAt: 1,
        lastAccessedAt: 1,
        payload: null,
      },
      store: {
        get: () => null,
        set: () => null,
        delete: () => null,
      },
    } as const;
    const invalidSession = {
      kind: "snapshot",
      snapshot: {
        token: "snapshot",
        resumeKey: null,
        pauseKind: "invalid" as PauseKind,
        createdAt: 1,
        lastAccessedAt: 1,
        payload: null,
      },
      store: {
        get: () => null,
        set: () => null,
        delete: () => null,
      },
    } as const;
    expect(readPauseKindFromSession(pauseSession)).toBe("human");
    expect(readPauseKindFromSession(snapshotSession)).toBe("external");
    expect(readPauseKindFromSession(invalidSession)).toBeNull();
  });
});
