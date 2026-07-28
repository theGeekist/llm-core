import type { InterruptStrategy } from "#adapters/types";
import type { MaybePromise } from "#shared/maybe";
import { bindFirst } from "#shared/fp";
import { isRecord } from "#shared/guards";
import { readPipelinePauseSnapshot } from "../pause";
import type { FinalizeResult, FinalizeResultInput } from "./helpers";

type InterruptPayload = { __interrupt?: InterruptStrategy };

const isInterruptStrategy = (value: unknown): value is InterruptStrategy =>
  isRecord(value) && (value.mode === "continue" || value.mode === "restart");

const readSnapshotInterrupt = (result: unknown) => {
  const payload = readPipelinePauseSnapshot(result)?.payload;
  if (!isRecord(payload)) {
    return null;
  }
  return isInterruptStrategy(payload.interrupt) ? payload.interrupt : null;
};

export const readInterruptStrategy = (result: unknown): InterruptStrategy | undefined => {
  const direct = (result as InterruptPayload)?.__interrupt;
  return isInterruptStrategy(direct) ? direct : (readSnapshotInterrupt(result) ?? undefined);
};

const hasInterrupt = (value: Record<string, unknown>) => readInterruptStrategy(value) !== undefined;

const attachInterrupt = (interrupt: InterruptStrategy, result: unknown) => {
  if (!isRecord(result)) {
    return result;
  }
  if (hasInterrupt(result)) {
    return result;
  }
  return { ...result, __interrupt: interrupt };
};

type FinalizeWithInterrupt<TOutcome> = {
  finalize: FinalizeResult<TOutcome>;
  attach: (result: unknown) => unknown;
};

const finalizeWithInterrupt = <TOutcome>(
  input: FinalizeWithInterrupt<TOutcome>,
  payload: FinalizeResultInput,
): MaybePromise<TOutcome> =>
  input.finalize({
    ...payload,
    result: input.attach(payload.result),
  });

export const createFinalizeWithInterrupt = <TOutcome>(
  finalize: FinalizeResult<TOutcome>,
  interrupt?: InterruptStrategy | null,
) => {
  if (!interrupt) {
    return finalize;
  }
  return bindFirst(finalizeWithInterrupt<TOutcome>, {
    finalize,
    attach: bindFirst(attachInterrupt, interrupt),
  });
};

export const createRuntimeFinalize = <TOutcome>(input: {
  finalizeResult: FinalizeResult<TOutcome>;
  interrupt?: InterruptStrategy | null;
}) => createFinalizeWithInterrupt(input.finalizeResult, input.interrupt);

export const hasRestartInterrupt = (interrupt?: InterruptStrategy) => interrupt?.mode === "restart";

export const readRestartInterrupt = (result: unknown) =>
  hasRestartInterrupt(readInterruptStrategy(result));
