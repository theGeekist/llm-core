import type { PipelineRollback } from "@wpkernel/pipeline/core";

export type RollbackEntry = {
  helper: { key: string };
  rollback: PipelineRollback;
};

export type RollbackState = {
  helperRollbacks?: Map<string, RollbackEntry[]>;
};
