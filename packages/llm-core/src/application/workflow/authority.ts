import { verifyCompilationAuthority } from "../specification-compiler/runtime";
import type { ResumeInterventionWorkflowInput, ResumableWorkflowStep } from "./types";

const sameDigest = (
  left: {
    readonly algorithm: string;
    readonly keyRef: { readonly secretId: string };
    readonly value: string;
  },
  right: typeof left,
): boolean =>
  left.algorithm === right.algorithm &&
  left.keyRef.secretId === right.keyRef.secretId &&
  left.value === right.value;

const stepMatchesPlan = (
  planned: NonNullable<
    ResumeInterventionWorkflowInput["specification"]
  >["compiled"]["value"]["steps"][number],
  step: ResumableWorkflowStep | undefined,
): boolean => {
  if (!step || planned.stepId !== step.stepId || planned.effect !== step.effect) {
    return false;
  }
  return (
    planned.effect === "none" ||
    (step.effect === "meaningful" &&
      planned.action.canonicalDocument === step.action.canonicalDocument &&
      sameDigest(planned.action.digest, step.action.digest))
  );
};

/** Rechecks provenance and binds executable steps to the frozen declarative target. */
export const workflowSpecificationMatches = async (
  input: ResumeInterventionWorkflowInput,
): Promise<boolean> => {
  if (input.specification === undefined) return true;
  try {
    await verifyCompilationAuthority({
      compiled: input.specification.compiled,
      authority: input.specification.authority,
    });
    const planned = input.specification.compiled.value.steps;
    return (
      planned.length === input.steps.length &&
      planned.every((step, index) => stepMatchesPlan(step, input.steps[index]))
    );
  } catch {
    return false;
  }
};
