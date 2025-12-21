import { Workflow } from "#workflow";
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
};

export const makeRuntime = (
  name: RecipeName,
  options?: {
    plugins?: Plugin[];
    run?: (options: TestRunOptions) => unknown;
  }
) => {
  const contract = getContract(name);
  const run = options?.run;
  const pipelineFactory = run
    ? withFactory(
        () =>
          ({
            run: (runOptions: TestRunOptions) => run(runOptions),
            extensions: { use: () => undefined },
          }) as never
      )
    : undefined;
  return createRuntime({
    contract,
    plugins: options?.plugins ?? [],
    pipelineFactory,
  });
};

export const makeWorkflow = (name: RecipeName, plugins: Plugin[] = []) => {
  let builder = Workflow.recipe(name);
  for (const plugin of plugins) {
    builder = builder.use(plugin);
  }
  return builder.build();
};
