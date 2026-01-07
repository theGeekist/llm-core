import type { InterruptStrategy } from "../../adapters/types";
import type { MaybePromise } from "../../shared/maybe";
import { bindFirst } from "../../shared/maybe";
import { isRecord } from "../../shared/guards";
import type { FinalizeResult, FinalizeResultInput } from "./helpers";

type InterruptPayload = { __interrupt?: InterruptStrategy };

const hasInterrupt = (value: Record<string, unknown>) => "__interrupt" in value;

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

export const readInterruptStrategy = (result: unknown): InterruptStrategy | undefined =>
  (result as InterruptPayload)?.__interrupt;

export const hasRestartInterrupt = (interrupt?: InterruptStrategy) => interrupt?.mode === "restart";

export const readRestartInterrupt = (result: unknown) =>
  hasRestartInterrupt(readInterruptStrategy(result));
