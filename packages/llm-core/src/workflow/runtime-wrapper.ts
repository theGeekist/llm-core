import { bindFirst } from "#shared/fp";
import type {
  ArtefactOf,
  RecipeName,
  ResumeInputOf,
  RunInputOf,
  Runtime,
  WorkflowResumeRequest,
  WorkflowRuntime,
} from "./types";
import { mergeRetryConfig } from "./runtime/retry";

type RecipeRuntime<N extends RecipeName> = WorkflowRuntime<
  RunInputOf<N>,
  ArtefactOf<N>,
  ResumeInputOf<N>
>;

export type RuntimeRunMethod<N extends RecipeName> = RecipeRuntime<N>["run"];
export type RuntimeResumeMethod<N extends RecipeName> = NonNullable<RecipeRuntime<N>["resume"]>;

export type RuntimeDecorator<N extends RecipeName> = {
  run: (
    next: RuntimeRunMethod<N>,
    input: RunInputOf<N>,
    runtime?: Runtime,
  ) => ReturnType<RuntimeRunMethod<N>>;
  resume: (
    next: RuntimeResumeMethod<N>,
    request: WorkflowResumeRequest<ResumeInputOf<N>>,
  ) => ReturnType<RuntimeResumeMethod<N>>;
};

export const wrapRuntime = <N extends RecipeName>(
  runtime: RecipeRuntime<N>,
  decorator: RuntimeDecorator<N>,
): RecipeRuntime<N> => {
  const run = runtime.run.bind(runtime) as RuntimeRunMethod<N>;
  const resume = runtime.resume?.bind(runtime) as RuntimeResumeMethod<N> | undefined;
  return {
    ...runtime,
    run: (input, runtimeInput) => decorator.run(run, input, runtimeInput),
    resume: resume ? (request) => decorator.resume(resume, request) : undefined,
  };
};

export const mergeRuntimeDefaults = (
  defaults: Runtime | undefined,
  runtime?: Runtime,
): Runtime | undefined => {
  if (!defaults) {
    return runtime;
  }
  if (!runtime) {
    return defaults;
  }
  return {
    ...defaults,
    ...runtime,
    retryDefaults: mergeRetryConfig(defaults.retryDefaults, runtime.retryDefaults) ?? undefined,
    retry: mergeRetryConfig(defaults.retry, runtime.retry) ?? undefined,
  };
};

const runWithRuntimeDefaults = <N extends RecipeName>(
  defaults: Runtime,
  next: RuntimeRunMethod<N>,
  ...args: Parameters<RuntimeRunMethod<N>>
) => next(args[0], mergeRuntimeDefaults(defaults, args[1]));

const resumeWithRuntimeDefaults = <N extends RecipeName>(
  defaults: Runtime,
  next: RuntimeResumeMethod<N>,
  request: WorkflowResumeRequest<ResumeInputOf<N>>,
) =>
  next({
    ...request,
    runtime: mergeRuntimeDefaults(defaults, request.runtime),
  });

export const wrapRuntimeWithDefaults = <N extends RecipeName>(
  runtime: RecipeRuntime<N>,
  defaults?: Runtime,
): RecipeRuntime<N> => {
  if (!defaults) {
    return runtime;
  }
  return wrapRuntime(runtime, {
    run: bindFirst(runWithRuntimeDefaults<N>, defaults),
    resume: bindFirst(resumeWithRuntimeDefaults<N>, defaults),
  });
};
