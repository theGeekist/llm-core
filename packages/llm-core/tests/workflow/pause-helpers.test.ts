import { describe, expect, it } from "bun:test";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";
import {
  isPipelinePaused,
  readPausedSteps,
  readPauseFlag,
  readPauseMeta,
  readPauseSnapshotReporterFromSnapshot,
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
  it("detects pipeline paused envelopes and missing snapshots", () => {
    const snapshot = createSnapshot({});
    expect(isPipelinePaused({ __paused: true, snapshot })).toBe(true);
    expect(isPipelinePaused({ __paused: false })).toBe(false);
    expect(readPausedSteps({})).toEqual([]);
  });

  it("reads pause metadata and flags", () => {
    const snapshot = createSnapshot({});
    const paused = { __paused: true, snapshot };
    expect(readPauseMeta(paused)).toEqual({ token: "token-1", pauseKind: "human" });
    expect(readPauseFlag(paused)).toBe(true);
    expect(readPauseFlag({ paused: false })).toBe(false);
    expect(readPauseMeta({ token: "direct-token", pauseKind: "system" })).toEqual({
      token: undefined,
      pauseKind: undefined,
    });
  });

  it("handles null and primitive pause values", () => {
    for (const value of [null, undefined, false, 0, "pause"]) {
      expect(readPauseMeta(value)).toEqual({ token: undefined, pauseKind: undefined });
      expect(readPauseFlag(value)).toBe(false);
    }
  });

  it("reads pause reporters from snapshots", () => {
    const reporter = { warn: () => null };
    const snapshot = createSnapshot({ reporter });
    expect(readPauseSnapshotReporterFromSnapshot(snapshot)).toBe(reporter);
    const contextSnapshot = createSnapshot({ context: { reporter } });
    expect(readPauseSnapshotReporterFromSnapshot(contextSnapshot)).toBe(reporter);
  });
});
