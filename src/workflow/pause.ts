import type {
  PipelinePauseSnapshot,
  PipelinePaused,
  PipelineReporter,
  PipelineStep,
} from "@wpkernel/pipeline/core";
import type { PauseKind } from "../adapters/types";
import { isRecord, isString } from "../shared/guards";

const hasPausedFlag = (value: Record<string, unknown>) => value.__paused === true;

const isPauseKind = (value: unknown): value is PauseKind =>
  value === "human" || value === "external" || value === "system";

export const toPauseKind = (value: unknown): PauseKind | null =>
  isPauseKind(value) ? value : null;

export const isPipelinePaused = (value: unknown): value is PipelinePaused<unknown> => {
  if (!isRecord(value)) {
    return false;
  }
  if (!hasPausedFlag(value)) {
    return false;
  }
  return "snapshot" in value;
};

export const readPipelinePauseSnapshot = (
  value: unknown,
): PipelinePauseSnapshot<unknown> | null => {
  if (!isPipelinePaused(value)) {
    return null;
  }
  return value.snapshot;
};

export const readPauseSnapshotState = (value: unknown): Record<string, unknown> | null => {
  const snapshot = readPipelinePauseSnapshot(value);
  if (!snapshot) {
    return null;
  }
  return snapshot.state as Record<string, unknown>;
};

export const readPauseSnapshotStateFromSnapshot = (
  snapshot: PipelinePauseSnapshot<unknown>,
): Record<string, unknown> => snapshot.state as Record<string, unknown>;

export const readPauseSnapshotReporterFromSnapshot = (
  snapshot: PipelinePauseSnapshot<unknown>,
): PipelineReporter | null => {
  const state = readPauseSnapshotStateFromSnapshot(snapshot);
  return (
    (state as { reporter?: PipelineReporter }).reporter ??
    (state as { context?: { reporter?: PipelineReporter } }).context?.reporter ??
    null
  );
};

export const readPausedUserState = <T>(value: unknown): T | null => {
  const state = readPauseSnapshotState(value);
  if (!state) {
    return null;
  }
  return (state as { userState?: T }).userState ?? null;
};

export const readPausedSteps = (value: unknown): PipelineStep[] => {
  const state = readPauseSnapshotState(value);
  if (!state) {
    return [];
  }
  const steps = (state as { steps?: PipelineStep[] }).steps;
  return steps ? [...steps] : [];
};

export const readPausedReporter = (value: unknown): PipelineReporter | null => {
  const state = readPauseSnapshotState(value);
  if (!state) {
    return null;
  }
  return (state as { context?: { reporter?: PipelineReporter } }).context?.reporter ?? null;
};

export const readPauseSnapshotToken = (value: unknown): unknown | null => {
  if (isPipelinePaused(value)) {
    return value.snapshot.token ?? null;
  }
  if (!isRecord(value) || !("token" in value)) {
    return null;
  }
  return (value as { token?: unknown }).token ?? null;
};

export const isPauseResumeKey = (value: unknown): value is string =>
  isString(value) && value.length > 0;

export const readPauseResumeKeyFromState = (state: unknown): string | null => {
  if (!state || typeof state !== "object") {
    return null;
  }
  const resumeKey = (state as { __pause?: { resumeKey?: unknown } }).__pause?.resumeKey;
  return isPauseResumeKey(resumeKey) ? resumeKey : null;
};

export const readPauseResumeKeyFromSnapshot = (
  snapshot: ReturnType<typeof readPipelinePauseSnapshot>,
): string | null => readPauseResumeKeyFromState(snapshot?.state);

/** @internal */
export const readPauseResumeKeyFromResult = (result: unknown): string | null => {
  const snapshot = readPipelinePauseSnapshot(result);
  if (snapshot) {
    const resumeKey = readPauseResumeKeyFromSnapshot(snapshot);
    if (resumeKey) {
      return resumeKey;
    }
  }
  const directResumeKey = (result as { resumeKey?: unknown }).resumeKey;
  if (isPauseResumeKey(directResumeKey)) {
    return directResumeKey;
  }
  const artifactResumeKey = (result as { artifact?: { __pause?: { resumeKey?: unknown } } })
    .artifact?.__pause?.resumeKey;
  if (isPauseResumeKey(artifactResumeKey)) {
    return artifactResumeKey;
  }
  const stateResumeKey = (result as { state?: { __pause?: { resumeKey?: unknown } } }).state
    ?.__pause?.resumeKey;
  return isPauseResumeKey(stateResumeKey) ? stateResumeKey : null;
};

/** @internal */
export const readPauseSnapshotPayload = (result: unknown) => {
  const typed = result as { pauseSnapshot?: unknown; resumeSnapshot?: unknown };
  return typed.pauseSnapshot ?? typed.resumeSnapshot;
};

/** @internal */
export const readPauseMeta = (result: unknown) => {
  const snapshot = readPipelinePauseSnapshot(result);
  if (snapshot) {
    return { token: snapshot.token, pauseKind: snapshot.pauseKind };
  }
  const direct = result as { token?: unknown; pauseKind?: PauseKind };
  if (direct.token !== undefined || direct.pauseKind !== undefined) {
    return { token: direct.token, pauseKind: direct.pauseKind };
  }
  const artifact = (
    result as { artifact?: { __pause?: { token?: unknown; pauseKind?: PauseKind } } }
  ).artifact;
  if (artifact?.__pause) {
    return { token: artifact.__pause.token, pauseKind: artifact.__pause.pauseKind };
  }
  const state = (result as { state?: { __pause?: { token?: unknown; pauseKind?: PauseKind } } })
    .state;
  return { token: state?.__pause?.token, pauseKind: state?.__pause?.pauseKind };
};

/** @internal */
export const readPauseFlag = (result: unknown) => {
  if (readPipelinePauseSnapshot(result)) {
    return true;
  }
  const direct = (result as { paused?: boolean }).paused;
  if (direct !== undefined) {
    return direct;
  }
  const artifact = (result as { artifact?: { __pause?: { paused?: boolean } } }).artifact;
  if (artifact?.__pause?.paused !== undefined) {
    return artifact.__pause.paused;
  }
  const state = (result as { state?: { __pause?: { paused?: boolean } } }).state;
  return state?.__pause?.paused;
};
