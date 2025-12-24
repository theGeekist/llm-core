import type { PauseKind } from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";

export type ExecutionIterator = Iterator<unknown> | AsyncIterator<unknown>;

export type PauseSession = {
  iterator: ExecutionIterator;
  pauseKind?: PauseKind;
  getDiagnostics: () => DiagnosticEntry[];
  createdAt: number;
};

export type IteratorFinalize<TOutcome> = (
  result: unknown,
  getDiagnostics: () => DiagnosticEntry[],
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  iterator?: ExecutionIterator,
) => MaybePromise<TOutcome>;
