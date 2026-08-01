import { verifyCompilationAuthority } from "../specification-compiler/runtime";
import { cloneFrozen } from "#shared/portable-data";
import type { SpecificationDecisionBinding } from "../../features/state/public";
import type {
  ResumeInterventionWorkflowInput,
  ResumableWorkflowStep,
  WorkflowSpecificationAuthority,
} from "./types";

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length &&
  [...left].sort().every((value, index) => value === [...right].sort()[index]);

const bindingMatches = (
  binding: SpecificationDecisionBinding,
  specification: WorkflowSpecificationAuthority,
): boolean => {
  const record = specification.compiled.accepted.record;
  return (
    binding.recordId === record.recordId &&
    binding.authority === record.authority &&
    binding.resolvedDigest.algorithm === record.resolvedDigest.algorithm &&
    binding.resolvedDigest.value === record.resolvedDigest.value &&
    sameStrings(binding.acceptedScope, record.acceptedScope) &&
    sameStrings(
      binding.policyVersions.map((policy) => `${policy.policyId}:${policy.version}`),
      record.policyVersions.map((policy) => `${policy.policyId}:${policy.version}`),
    ) &&
    sameStrings(
      binding.sources.map(
        (source) => `${source.sourceId}:${source.revision}:${source.contentDigest.value}`,
      ),
      record.sources.map(
        (source) => `${source.sourceId}:${source.revision}:${source.contentDigest.value}`,
      ),
    )
  );
};

/** Creates the portable accepted-decision binding that must travel with a checkpoint. */
export const createWorkflowSpecificationBinding = (
  specification: WorkflowSpecificationAuthority,
): SpecificationDecisionBinding => {
  const record = specification.compiled.accepted.record;
  return cloneFrozen({
    recordId: record.recordId,
    authority: record.authority,
    resolvedDigest: record.resolvedDigest,
    acceptedScope: record.acceptedScope,
    policyVersions: record.policyVersions,
    sources: record.sources,
  });
};

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
  if (input.specification === undefined) return input.checkpoint.specification === undefined;
  if (input.checkpoint.specification === undefined) return false;
  try {
    await verifyCompilationAuthority({
      compiled: input.specification.compiled,
      authority: input.specification.authority,
    });
    if (!bindingMatches(input.checkpoint.specification, input.specification)) {
      return false;
    }
    const planned = input.specification.compiled.value.steps;
    return (
      planned.length === input.steps.length &&
      planned.every((step, index) => stepMatchesPlan(step, input.steps[index]))
    );
  } catch {
    return false;
  }
};
