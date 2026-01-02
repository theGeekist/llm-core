import { bindFirst } from "../maybe";
import type {
  ArtefactOf,
  RecipeName,
  ResumeInputOf,
  RunInputOf,
  Runtime,
  WorkflowRuntime,
} from "../workflow/types";
import { mergeRetryConfig } from "../workflow/runtime/retry";
import type { RecipeDefaults } from "./flow";

type RuntimeDefaultsInput<N extends RecipeName> = {
  runtime: WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>;
  defaults?: Runtime;
};

type RuntimeWithResume<N extends RecipeName> = WorkflowRuntime<
  RunInputOf<N>,
  ArtefactOf<N>,
  ResumeInputOf<N>
> & {
  resume: NonNullable<WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>["resume"]>;
};

type RuntimeDefaultsResumeInput<N extends RecipeName> = {
  runtime: RuntimeWithResume<N>;
  defaults?: Runtime;
};

export const buildRuntimeDefaults = (defaults: RecipeDefaults): Runtime | undefined =>
  defaults.retryDefaults ? { retryDefaults: defaults.retryDefaults } : undefined;

const mergeRuntimeDefaults = (defaults: Runtime | undefined, runtime?: Runtime) => {
  if (!defaults) {
    return runtime;
  }
  if (!runtime) {
    return defaults;
  }
  return {
    ...defaults,
    ...runtime,
    retryDefaults: mergeRetryConfig(defaults.retryDefaults, runtime.retryDefaults),
  };
};

const runWithRuntimeDefaults = <N extends RecipeName>(
  input: RuntimeDefaultsInput<N>,
  runInput: RunInputOf<N>,
  runtime?: Runtime,
) => input.runtime.run(runInput, mergeRuntimeDefaults(input.defaults, runtime));

type ResumeWithDefaultsPayload<N extends RecipeName> = {
  token: unknown;
  resumeInput?: ResumeInputOf<N>;
  runtime?: Runtime;
};

const resumeWithRuntimeDefaults = <N extends RecipeName>(
  input: RuntimeDefaultsResumeInput<N>,
  payload: ResumeWithDefaultsPayload<N>,
) =>
  input.runtime.resume(
    payload.token,
    payload.resumeInput,
    mergeRuntimeDefaults(input.defaults, payload.runtime),
  );

const resumeWithRuntimeDefaultsArgs = <N extends RecipeName>(
  input: RuntimeDefaultsResumeInput<N>,
  ...args: [token: unknown, resumeInput?: ResumeInputOf<N>, runtime?: Runtime]
) =>
  resumeWithRuntimeDefaults(input, {
    token: args[0],
    resumeInput: args[1],
    runtime: args[2],
  });

const createRuntimeDefaultsInput = <N extends RecipeName>(
  runtime: WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>,
  defaults?: Runtime,
) => ({ runtime, defaults });

export const wrapRuntimeWithDefaults = <N extends RecipeName>(
  runtime: WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>,
  defaults?: Runtime,
) => {
  if (!defaults) {
    return runtime;
  }
  const input = createRuntimeDefaultsInput(runtime, defaults);
  const resumeInput = runtime.resume
    ? ({
        runtime: runtime as RuntimeWithResume<N>,
        defaults,
      } satisfies RuntimeDefaultsResumeInput<N>)
    : undefined;
  return {
    ...runtime,
    run: bindFirst(runWithRuntimeDefaults<N>, input),
    resume: resumeInput ? bindFirst(resumeWithRuntimeDefaultsArgs<N>, resumeInput) : undefined,
  };
};
