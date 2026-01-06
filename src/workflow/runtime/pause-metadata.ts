import type { InterruptStrategy } from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { bindFirst } from "../../maybe";
import type { FinalizeResult, FinalizeResultInput } from "./helpers";

type InterruptPayload = { __interrupt?: InterruptStrategy };

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

const hasInterrupt = (value: Record<string, unknown>) => "__interrupt" in value;

const attachInterrupt = (interrupt: InterruptStrategy, result: unknown) => {
  if (!isObject(result)) {
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
