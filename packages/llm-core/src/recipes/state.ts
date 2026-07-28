import { bindFirst } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import { isRecord } from "#shared/guards";
import { createRecipeDiagnostic } from "#shared/diagnostics";
import { addTrace } from "#shared/reporting";
import type { TraceEvent } from "#shared/reporting";
import type {
  ArtefactOf,
  Outcome,
  RecipeName,
  ResumeInputOf,
  RunInputOf,
  WorkflowRuntime,
} from "#workflow/types";
import type { RuntimeResumeMethod, RuntimeRunMethod } from "#workflow/runtime-wrapper";
import { wrapRuntime } from "#workflow/runtime-wrapper";

export type StateValidationResult = {
  valid: boolean;
  errors?: unknown;
};

export type StateValidator = (state: unknown) => StateValidationResult | boolean;

const isStateValidationResult = (value: unknown): value is StateValidationResult =>
  isRecord(value) && typeof (value as { valid?: unknown }).valid === "boolean";

const readStateValidationResult = (value: unknown): StateValidationResult => {
  if (typeof value === "boolean") {
    return { valid: value };
  }
  if (isStateValidationResult(value)) {
    return value;
  }
  return { valid: false, errors: { code: "state_validator_invalid_result", value } };
};

const createStateValidationDiagnostic = (errors?: unknown) =>
  createRecipeDiagnostic("Recipe state validation failed.", errors ? { errors } : undefined);

const applyStateValidationToOutcome = <T>(
  validator: StateValidator,
  outcome: Outcome<T>,
): Outcome<T> => {
  if (outcome.status !== "ok") {
    return outcome;
  }
  const validation = readStateValidationResult(validator(outcome.artefact));
  if (validation.valid) {
    return outcome;
  }
  const diagnostics = outcome.diagnostics.concat(
    createStateValidationDiagnostic(validation.errors),
  );
  const trace = [...outcome.trace];
  addTrace({ trace: trace as TraceEvent[] }, "recipe.state.invalid", { errors: validation.errors });
  return { ...outcome, diagnostics, trace };
};

const runWithStateValidation = <N extends RecipeName>(
  validator: StateValidator,
  next: RuntimeRunMethod<N>,
  ...args: Parameters<RuntimeRunMethod<N>>
) => maybeMap(bindFirst(applyStateValidationToOutcome, validator), next(...args));

const resumeWithStateValidation = <N extends RecipeName>(
  validator: StateValidator,
  next: RuntimeResumeMethod<N>,
  ...args: Parameters<RuntimeResumeMethod<N>>
) => maybeMap(bindFirst(applyStateValidationToOutcome, validator), next(...args));

export const wrapRuntimeWithStateValidation = <N extends RecipeName>(
  runtime: WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>,
  validator?: StateValidator,
) => {
  if (!validator) {
    return runtime;
  }
  return wrapRuntime(runtime, {
    run: bindFirst(runWithStateValidation<N>, validator),
    resume: bindFirst(resumeWithStateValidation<N>, validator),
  });
};
