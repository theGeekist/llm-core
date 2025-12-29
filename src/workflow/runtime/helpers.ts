import type { MaybePromise } from "../../maybe";
import { bindFirst } from "../../maybe";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";
export type FinalizeResult<TOutcome> = (
  result: unknown,
  getDiagnostics: () => DiagnosticEntry[],
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  recordSnapshot?: (result: unknown) => MaybePromise<boolean | null>,
) => MaybePromise<TOutcome>;

type FinalizeInput<TOutcome> = {
  finalizeResult: FinalizeResult<TOutcome>;
  recordSnapshot: (result: unknown) => MaybePromise<boolean | null>;
};

const finalizeWithSnapshot = <TOutcome>(
  input: FinalizeInput<TOutcome>,
  result: unknown,
  getDiagnostics: () => DiagnosticEntry[],
  runtimeTrace: TraceEvent[],
  mode: "default" | "strict",
) => input.finalizeResult(result, getDiagnostics, runtimeTrace, mode, input.recordSnapshot);

export const createFinalize = <TOutcome>(
  finalizeResult: FinalizeResult<TOutcome>,
  recordSnapshot: (result: unknown) => MaybePromise<boolean | null>,
) =>
  bindFirst(finalizeWithSnapshot, {
    finalizeResult,
    recordSnapshot,
  });

const readDiagnostics = (sets: DiagnosticEntry[][]) =>
  sets.reduce<DiagnosticEntry[]>((acc, next) => acc.concat(next), []);

export const createDiagnosticsGetter = (sets: DiagnosticEntry[][]) =>
  bindFirst(readDiagnostics, sets);
