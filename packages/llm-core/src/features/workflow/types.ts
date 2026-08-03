import type { StepId } from "#contracts";
import type { BoundAction } from "../tooling/runtime";

/** Portable projection of one approved workflow step. */
export type WorkflowExecutionPlanStep =
  | {
      readonly stepId: StepId;
      readonly effect: "none";
    }
  | {
      readonly stepId: StepId;
      readonly effect: "meaningful";
      readonly action: Pick<BoundAction, "canonicalDocument" | "digest">;
    };

/** Declarative workflow intent for compilation by an explicit runtime integration. */
export interface WorkflowExecutionPlan {
  readonly steps: readonly WorkflowExecutionPlanStep[];
}
