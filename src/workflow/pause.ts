import type { PipelinePauseSnapshot, PipelinePaused } from "@wpkernel/pipeline/core";
import type { PauseKind } from "../adapters/types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

const hasPausedFlag = (value: Record<string, unknown>) => value.__paused === true;

const isPauseKind = (value: unknown): value is PauseKind =>
  value === "human" || value === "external" || value === "system";

export const toPauseKind = (value: unknown): PauseKind | null =>
  isPauseKind(value) ? value : null;

export const isPipelinePaused = (value: unknown): value is PipelinePaused<unknown> => {
  if (!isObject(value)) {
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
