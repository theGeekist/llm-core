import type { InteractionRunOutcome, InteractionRunResult } from "#interaction";
import type { PipelinePaused } from "@wpkernel/pipeline/core";

export const isPausedResult = (value: unknown): value is PipelinePaused<Record<string, unknown>> =>
  !!value &&
  typeof value === "object" &&
  "__paused" in value &&
  (value as { __paused?: unknown }).__paused === true;

export function assertRunResult(result: InteractionRunOutcome): InteractionRunResult {
  if (isPausedResult(result)) {
    throw new Error("Expected interaction run result.");
  }
  return result;
}
