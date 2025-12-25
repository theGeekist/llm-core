import type { MaybePromise } from "../../maybe";
import { bindFirst } from "../../maybe";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";
import type { ExecutionIterator } from "../driver/types";

export type FinalizeResult<TOutcome> = (
  result: unknown,
  getDiagnostics: () => DiagnosticEntry[],
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  iterator?: ExecutionIterator,
  recordSnapshot?: (result: unknown) => MaybePromise<void>,
) => MaybePromise<TOutcome>;

type FinalizeInput<TOutcome> = {
  finalizeResult: FinalizeResult<TOutcome>;
  recordSnapshot: (result: unknown) => MaybePromise<void>;
};

const finalizeWithSnapshot = <TOutcome>(
  input: FinalizeInput<TOutcome>,
  result: unknown,
  getDiagnostics: () => DiagnosticEntry[],
  runtimeTrace: TraceEvent[],
  mode: "default" | "strict",
  iterator?: ExecutionIterator,
) =>
  input.finalizeResult(result, getDiagnostics, runtimeTrace, mode, iterator, input.recordSnapshot);

export const createFinalize = <TOutcome>(
  finalizeResult: FinalizeResult<TOutcome>,
  recordSnapshot: (result: unknown) => MaybePromise<void>,
) =>
  bindFirst(finalizeWithSnapshot, {
    finalizeResult,
    recordSnapshot,
  });

const readDiagnostics = (sets: DiagnosticEntry[][]) =>
  sets.reduce<DiagnosticEntry[]>((acc, next) => acc.concat(next), []);

export const createDiagnosticsGetter = (sets: DiagnosticEntry[][]) =>
  bindFirst(readDiagnostics, sets);
