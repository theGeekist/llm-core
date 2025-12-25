import type { MaybePromise } from "../../maybe";
import { bindFirst, chainMaybe, tryMaybe } from "../../maybe";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";
import type { ExecutionIterator, IteratorFinalize } from "./types";

type IteratorStep<TOutcome> =
  | { kind: "iteration"; iteration: IteratorResult<unknown> }
  | { kind: "error"; outcome: TOutcome };

const wrapIteration = <TOutcome>(iteration: IteratorResult<unknown>): IteratorStep<TOutcome> => ({
  kind: "iteration",
  iteration,
});

const wrapError = <TOutcome>(outcome: TOutcome): IteratorStep<TOutcome> => ({
  kind: "error",
  outcome,
});

type NextStepInput = {
  iterator: ExecutionIterator;
  input: unknown;
};

const nextStep = <TOutcome>(input: NextStepInput): MaybePromise<IteratorStep<TOutcome>> =>
  chainMaybe(input.iterator.next(input.input), wrapIteration<TOutcome>);

type NextErrorInput<TOutcome> = {
  onError: (error: unknown) => MaybePromise<TOutcome>;
};

const handleNextError = <TOutcome>(input: NextErrorInput<TOutcome>, error: unknown) =>
  chainMaybe(input.onError(error), wrapError);

const safeNextStep = <TOutcome>(
  iterator: ExecutionIterator,
  input: unknown,
  onError: (error: unknown) => MaybePromise<TOutcome>,
) =>
  tryMaybe(
    bindFirst(nextStep<TOutcome>, { iterator, input }),
    bindFirst(handleNextError<TOutcome>, { onError }),
  );

const isPausedIteration = (iteration: IteratorResult<unknown>) =>
  iteration.done === false && (iteration.value as { paused?: boolean }).paused === true;

const handleIteratorStep = <TOutcome>(
  step: IteratorStep<TOutcome>,
  iterator: ExecutionIterator,
  getDiagnostics: () => DiagnosticEntry[],
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  finalize: IteratorFinalize<TOutcome>,
  onInvalidYield: (value: unknown) => MaybePromise<TOutcome>,
): MaybePromise<TOutcome> => {
  if (step.kind === "error") {
    return step.outcome;
  }
  if (step.iteration.done) {
    return finalize(step.iteration.value, getDiagnostics, trace, diagnosticsMode);
  }
  if (!isPausedIteration(step.iteration)) {
    return onInvalidYield(step.iteration.value);
  }
  return finalize(step.iteration.value, getDiagnostics, trace, diagnosticsMode, iterator);
};

type IteratorStepInput<TOutcome> = {
  iterator: ExecutionIterator;
  getDiagnostics: () => DiagnosticEntry[];
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  finalize: IteratorFinalize<TOutcome>;
  onInvalidYield: (value: unknown) => MaybePromise<TOutcome>;
};

const runIteratorStep = <TOutcome>(
  input: IteratorStepInput<TOutcome>,
  step: IteratorStep<TOutcome>,
) =>
  handleIteratorStep(
    step,
    input.iterator,
    input.getDiagnostics,
    input.trace,
    input.diagnosticsMode,
    input.finalize,
    input.onInvalidYield,
  );

export type DriveIteratorInput<TOutcome> = {
  iterator: ExecutionIterator;
  input: unknown;
  trace: TraceEvent[];
  getDiagnostics: () => DiagnosticEntry[];
  diagnosticsMode: "default" | "strict";
  finalize: IteratorFinalize<TOutcome>;
  onError: (error: unknown) => MaybePromise<TOutcome>;
  onInvalidYield: (value: unknown) => MaybePromise<TOutcome>;
};

export const driveIterator = <TOutcome>({
  iterator,
  input,
  trace,
  getDiagnostics,
  diagnosticsMode,
  finalize,
  onError,
  onInvalidYield,
}: DriveIteratorInput<TOutcome>): MaybePromise<TOutcome> => {
  const handleIteratorStepBound = bindFirst(runIteratorStep<TOutcome>, {
    iterator,
    getDiagnostics,
    trace,
    diagnosticsMode,
    finalize,
    onInvalidYield,
  });
  return chainMaybe(safeNextStep<TOutcome>(iterator, input, onError), handleIteratorStepBound);
};
