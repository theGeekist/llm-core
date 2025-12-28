import type { InterruptStrategy } from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { bindFirst } from "../../maybe";
import type { ExecutionIterator, IteratorFinalize } from "../driver/types";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";

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
  finalize: IteratorFinalize<TOutcome>;
  attach: (result: unknown) => unknown;
};

const finalizeWithInterrupt = <TOutcome>(
  input: FinalizeWithInterrupt<TOutcome>,
  result: unknown,
  getDiagnostics: () => DiagnosticEntry[],
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  iterator?: ExecutionIterator,
): MaybePromise<TOutcome> =>
  input.finalize(input.attach(result), getDiagnostics, trace, diagnosticsMode, iterator);

export const createFinalizeWithInterrupt = <TOutcome>(
  finalize: IteratorFinalize<TOutcome>,
  interrupt?: InterruptStrategy,
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
