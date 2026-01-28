import type { MaybePromise } from "#shared/maybe";
import { bindFirst } from "#shared/fp";
import type { DiagnosticEntry } from "#shared/reporting";
import type { TraceEvent } from "#shared/reporting";

export type FinalizeResultInput = {
  result: unknown;
  getDiagnostics: () => DiagnosticEntry[];
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  recordSnapshot?: (result: unknown) => MaybePromise<boolean | null>;
};

export type FinalizeResult<TOutcome> = (input: FinalizeResultInput) => MaybePromise<TOutcome>;

type FinalizeInput<TOutcome> = {
  finalizeResult: FinalizeResult<TOutcome>;
  recordSnapshot: (result: unknown) => MaybePromise<boolean | null>;
};

const finalizeWithSnapshot = <TOutcome>(
  input: FinalizeInput<TOutcome>,
  payload: FinalizeResultInput,
) =>
  input.finalizeResult({
    ...payload,
    recordSnapshot: input.recordSnapshot,
  });

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
