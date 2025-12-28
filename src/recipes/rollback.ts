import type { HelperApplyResult } from "@wpkernel/pipeline";
import { createPipelineRollback } from "@wpkernel/pipeline/core";
import type { MaybePromise } from "../maybe";
import type { PipelineState } from "../workflow/types";

export type StepRollbackHandler = () => MaybePromise<boolean | null>;
export type StepRollback = ReturnType<typeof createPipelineRollback>;
export type StepRollbackInput = StepRollback | StepRollbackHandler;

const normalizeStepRollback = (rollback: StepRollbackInput): StepRollback =>
  typeof rollback === "function" ? createPipelineRollback(rollback) : rollback;

const hasRollback = (result: HelperApplyResult<PipelineState> | null) =>
  !!result && typeof result === "object" && "rollback" in result;

export const attachRollback = (
  rollback: StepRollbackInput,
  result: HelperApplyResult<PipelineState> | null,
) => {
  if (hasRollback(result)) {
    return result;
  }
  return {
    ...(result ?? {}),
    rollback: normalizeStepRollback(rollback),
  };
};

export const createStepRollback = (run: StepRollbackHandler): StepRollback =>
  createPipelineRollback(run);
