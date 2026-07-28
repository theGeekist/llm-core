import { createRuntime } from "#workflow/runtime";
import { getRecipe } from "#workflow/recipe-registry";
import type { Outcome, Plugin, RecipeName } from "#workflow/types";

const ERROR_MISSING_CONTRACT = "Missing recipe contract.";

export const withFactory =
  <T>(factory: () => T) =>
  (_contract: unknown, _plugins: unknown[]) => {
    void _contract;
    void _plugins;
    return factory();
  };

export const isPromiseLike = (value: unknown): value is Promise<unknown> =>
  !!value && typeof (value as Promise<unknown>).then === "function";

export const assertSyncOutcome = (value: Outcome | Promise<Outcome>) => {
  if (isPromiseLike(value)) {
    throw new Error("Expected a synchronous Outcome, got a Promise.");
  }
  return value;
};

export const resolveMaybe = async <T>(value: T | Promise<T>): Promise<T> => {
  if (isPromiseLike(value)) {
    return value as Promise<T>;
  }
  return value as T;
};

export const diagnosticMessages = (diagnostics: unknown[]) =>
  diagnostics
    .map((diagnostic) => {
      if (typeof diagnostic === "string") {
        return diagnostic;
      }
      const entry = diagnostic as { message?: string };
      return entry.message;
    })
    .filter((message): message is string => !!message);

export const getContract = (name: RecipeName) => {
  const contract = getRecipe(name);
  if (!contract) {
    throw new Error(ERROR_MISSING_CONTRACT);
  }
  return contract;
};

type TestRunOptions = {
  input: unknown;
  runtime?: unknown;
  reporter?: unknown;
  adapters?: unknown;
};

export const makeRuntime = (
  name: RecipeName,
  options?: {
    plugins?: Plugin[];
    run?: (options: TestRunOptions) => unknown;
    resume?: (snapshot: unknown, resumeInput?: unknown) => unknown;
    includeDefaults?: boolean;
  },
) => {
  const contract = getContract(name);
  const includeDefaults = options?.includeDefaults ?? true;
  const basePlugins = includeDefaults ? (contract.defaultPlugins ?? []) : [];
  const plugins = [...basePlugins, ...(options?.plugins ?? [])];
  const run = options?.run;
  const resume = options?.resume;
  const pipelineFactory = run
    ? withFactory(
        () =>
          ({
            run: (runOptions: TestRunOptions) => run(runOptions),
            resume: resume
              ? (snapshot: unknown, resumeInput?: unknown) => resume(snapshot, resumeInput)
              : undefined,
            extensions: { use: () => undefined },
          }) as never,
      )
    : undefined;
  return createRuntime({
    contract,
    plugins,
    pipelineFactory,
  });
};

export const makeWorkflow = (
  name: RecipeName,
  plugins: Plugin[] = [],
  options?: { includeDefaults?: boolean },
) => {
  const contract = getContract(name);
  return createRuntime({
    contract,
    plugins:
      options?.includeDefaults === false
        ? plugins
        : [...(contract.defaultPlugins ?? []), ...plugins],
  });
};
