import type { DiagnosticEntry } from "#shared/reporting";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";

export type PauseSession = {
  snapshot: PipelinePauseSnapshot<unknown>;
  getDiagnostics: () => DiagnosticEntry[];
  createdAt: number;
};
