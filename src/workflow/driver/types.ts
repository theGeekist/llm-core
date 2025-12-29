import type { DiagnosticEntry } from "../diagnostics";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";

export type PauseSession = {
  snapshot: PipelinePauseSnapshot<unknown>;
  getDiagnostics: () => DiagnosticEntry[];
  createdAt: number;
};
