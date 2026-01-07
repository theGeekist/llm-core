import { describe, expect, it } from "bun:test";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";
import {
  isPauseResumeKey,
  isPipelinePaused,
  readPausedSteps,
  readPauseFlag,
  readPauseMeta,
  readPauseResumeKeyFromResult,
  readPauseResumeKeyFromState,
  readPauseSnapshotPayload,
  readPauseSnapshotReporterFromSnapshot,
  readPauseSnapshotToken,
} from "../../src/workflow/pause";

const createSnapshot = (
  state: Record<string, unknown>,
  token: string = "token-1",
): PipelinePauseSnapshot<unknown> => ({
  token,
  pauseKind: "human",
  payload: { ok: true },
  createdAt: 1,
  stageIndex: 0,
  state,
});

describe("workflow pause helpers", () => {
  it("reads pause tokens from paused envelopes or direct tokens", () => {
    const snapshot = createSnapshot({});
    expect(readPauseSnapshotToken({ __paused: true, snapshot })).toBe("token-1");
    expect(readPauseSnapshotToken({ token: "direct-token" })).toBe("direct-token");
    expect(readPauseSnapshotToken({})).toBeNull();
  });

  it("detects pipeline paused envelopes and missing snapshots", () => {
    const snapshot = createSnapshot({});
    expect(isPipelinePaused({ __paused: true, snapshot })).toBe(true);
    expect(isPipelinePaused({ __paused: false })).toBe(false);
    expect(readPausedSteps({})).toEqual([]);
  });

  it("detects pause resume keys from results", () => {
    const snapshot = createSnapshot({ __pause: { resumeKey: "resume-snapshot" } });
    expect(readPauseResumeKeyFromResult({ __paused: true, snapshot })).toBe("resume-snapshot");
    expect(readPauseResumeKeyFromResult({ resumeKey: "resume-direct" })).toBe("resume-direct");
    expect(
      readPauseResumeKeyFromResult({ artifact: { __pause: { resumeKey: "resume-artifact" } } }),
    ).toBe("resume-artifact");
    expect(
      readPauseResumeKeyFromResult({ state: { __pause: { resumeKey: "resume-state" } } }),
    ).toBe("resume-state");
    expect(readPauseResumeKeyFromState(null)).toBeNull();
  });

  it("reads pause payload fallbacks", () => {
    expect(readPauseSnapshotPayload({ pauseSnapshot: { step: 1 } })).toEqual({ step: 1 });
    expect(readPauseSnapshotPayload({ resumeSnapshot: { step: 2 } })).toEqual({ step: 2 });
  });

  it("reads pause metadata and flags", () => {
    const snapshot = createSnapshot({});
    const paused = { __paused: true, snapshot };
    expect(readPauseMeta(paused)).toEqual({ token: "token-1", pauseKind: "human" });
    expect(readPauseFlag(paused)).toBe(true);
    expect(readPauseFlag({ paused: false })).toBe(false);
    expect(
      readPauseMeta({ state: { __pause: { token: "state-token", pauseKind: "system" } } }),
    ).toEqual({ token: "state-token", pauseKind: "system" });
  });

  it("reads pause reporters from snapshots", () => {
    const reporter = { warn: () => null };
    const snapshot = createSnapshot({ reporter });
    expect(readPauseSnapshotReporterFromSnapshot(snapshot)).toBe(reporter);
    const contextSnapshot = createSnapshot({ context: { reporter } });
    expect(readPauseSnapshotReporterFromSnapshot(contextSnapshot)).toBe(reporter);
  });

  it("validates resume keys", () => {
    expect(isPauseResumeKey("key")).toBe(true);
    expect(isPauseResumeKey("")).toBe(false);
    expect(isPauseResumeKey(42)).toBe(false);
  });
});
