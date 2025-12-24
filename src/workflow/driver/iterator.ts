import type { MaybePromise } from "../../maybe";
import { chainMaybe, tryMaybe } from "../../maybe";
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

const nextStep = <TOutcome>(
  iterator: ExecutionIterator,
  input: unknown,
): MaybePromise<IteratorStep<TOutcome>> =>
  chainMaybe(iterator.next(input), wrapIteration<TOutcome>);

const bindNextStep = <TOutcome>(iterator: ExecutionIterator, input: unknown) =>
  function advanceIterator() {
    return nextStep<TOutcome>(iterator, input);
  };

const handleNextError = <TOutcome>(handler: (error: unknown) => MaybePromise<TOutcome>) =>
  function handleNextErrorBound(error: unknown) {
    return chainMaybe(handler(error), wrapError);
  };

const safeNextStep = <TOutcome>(
  iterator: ExecutionIterator,
  input: unknown,
  onError: (error: unknown) => MaybePromise<TOutcome>,
) => tryMaybe(bindNextStep<TOutcome>(iterator, input), handleNextError(onError));

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

const bindIteratorStep = <TOutcome>(
  iterator: ExecutionIterator,
  getDiagnostics: () => DiagnosticEntry[],
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  finalize: IteratorFinalize<TOutcome>,
  onInvalidYield: (value: unknown) => MaybePromise<TOutcome>,
) =>
  function handleIteratorStepBound(step: IteratorStep<TOutcome>) {
    return handleIteratorStep(
      step,
      iterator,
      getDiagnostics,
      trace,
      diagnosticsMode,
      finalize,
      onInvalidYield,
    );
  };

export const driveIterator = <TOutcome>(
  iterator: ExecutionIterator,
  input: unknown,
  trace: TraceEvent[],
  getDiagnostics: () => DiagnosticEntry[],
  diagnosticsMode: "default" | "strict",
  finalize: IteratorFinalize<TOutcome>,
  onError: (error: unknown) => MaybePromise<TOutcome>,
  onInvalidYield: (value: unknown) => MaybePromise<TOutcome>,
): MaybePromise<TOutcome> =>
  chainMaybe(
    safeNextStep<TOutcome>(iterator, input, onError),
    bindIteratorStep(iterator, getDiagnostics, trace, diagnosticsMode, finalize, onInvalidYield),
  );
