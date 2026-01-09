import { bindFirst } from "../shared/fp";
import { maybeMap } from "../shared/maybe";
import { isRecord } from "../shared/guards";
import { createRecipeDiagnostic } from "../shared/diagnostics";
import { addTraceEvent } from "../shared/trace";
import type { TraceEvent } from "../shared/trace";
import type {
  ArtefactOf,
  Outcome,
  RecipeName,
  RunInputOf,
  ResumeInputOf,
  Runtime,
  WorkflowRuntime,
} from "../workflow/types";

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
  addTraceEvent(trace as TraceEvent[], "recipe.state.invalid", { errors: validation.errors });
  return { ...outcome, diagnostics, trace };
};

type RuntimeValidationInput<N extends RecipeName> = {
  runtime: WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>;
  validator: StateValidator;
};

type RuntimeWithResume<N extends RecipeName> = WorkflowRuntime<
  RunInputOf<N>,
  ArtefactOf<N>,
  ResumeInputOf<N>
> & {
  resume: NonNullable<WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>["resume"]>;
};

type RuntimeValidationWithResumeInput<N extends RecipeName> = {
  runtime: RuntimeWithResume<N>;
  validator: StateValidator;
};

const runWithStateValidation = <N extends RecipeName>(
  input: RuntimeValidationInput<N>,
  runInput: RunInputOf<N>,
  runtime?: Runtime,
) =>
  maybeMap(
    bindFirst(applyStateValidationToOutcome, input.validator),
    input.runtime.run(runInput, runtime),
  );

type ResumeStateValidationPayload<N extends RecipeName> = {
  token: unknown;
  resumeInput?: ResumeInputOf<N>;
  runtime?: Runtime;
};

const resumeWithStateValidation = <N extends RecipeName>(
  input: RuntimeValidationWithResumeInput<N>,
  payload: ResumeStateValidationPayload<N>,
) =>
  maybeMap(
    bindFirst(applyStateValidationToOutcome, input.validator),
    input.runtime.resume(payload.token, payload.resumeInput, payload.runtime),
  );

const resumeWithStateValidationArgs = <N extends RecipeName>(
  input: RuntimeValidationWithResumeInput<N>,
  ...args: [token: unknown, resumeInput?: ResumeInputOf<N>, runtime?: Runtime]
) =>
  resumeWithStateValidation(input, {
    token: args[0],
    resumeInput: args[1],
    runtime: args[2],
  });

const createRuntimeValidationInput = <N extends RecipeName>(
  runtime: WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>,
  validator: StateValidator,
) => ({ runtime, validator });

export const wrapRuntimeWithStateValidation = <N extends RecipeName>(
  runtime: WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>,
  validator?: StateValidator,
) => {
  if (!validator) {
    return runtime;
  }
  const input = createRuntimeValidationInput<N>(runtime, validator);
  const resumeInput = runtime.resume
    ? ({
        runtime: runtime as RuntimeWithResume<N>,
        validator,
      } satisfies RuntimeValidationWithResumeInput<N>)
    : undefined;
  return {
    ...runtime,
    run: bindFirst(runWithStateValidation<N>, input),
    resume: resumeInput ? bindFirst(resumeWithStateValidationArgs<N>, resumeInput) : undefined,
  };
};
