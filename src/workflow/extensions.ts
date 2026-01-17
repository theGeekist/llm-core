import { isPromiseLike, maybeAll, type PipelineReporter } from "@wpkernel/pipeline/core";
import type { PipelineWithExtensions, Plugin } from "./types";
import { createLifecycleDiagnostic } from "#shared/diagnostics";
import type { DiagnosticEntry } from "#shared/reporting";
import { getEffectivePlugins } from "./plugins/effective";
import type { MaybePromise } from "#shared/maybe";

const DEFAULT_LIFECYCLE = "init";

const createLifecycleMessage = (plugin: Plugin, reason: string) =>
  `Plugin "${plugin.key}" extension skipped (${reason}).`;

const hasExtensions = (pipeline: PipelineWithExtensions) =>
  !!pipeline.extensions && typeof pipeline.extensions.use === "function";

const trackMaybePromise = (pending: MaybePromise<unknown>[], value: unknown) => {
  if (isPromiseLike(value)) {
    pending.push(value as MaybePromise<unknown>);
  }
};

const isLifecycleScheduled = (lifecycleSet: Set<string>, lifecycle: string) =>
  lifecycleSet.has(lifecycle);

const describeMissingLifecycle = (lifecycle: string) =>
  lifecycle === DEFAULT_LIFECYCLE
    ? `default lifecycle "${DEFAULT_LIFECYCLE}" not scheduled`
    : `lifecycle "${lifecycle}" not scheduled`;

type RegisterExtensionInput = {
  pipeline: PipelineWithExtensions;
  plugin: Plugin;
  lifecycleSet: Set<string>;
  diagnostics: DiagnosticEntry[];
  pending: MaybePromise<unknown>[];
};

const registerPluginExtension = (input: RegisterExtensionInput) => {
  if (input.plugin.lifecycle && !isLifecycleScheduled(input.lifecycleSet, input.plugin.lifecycle)) {
    input.diagnostics.push(
      createLifecycleDiagnostic(
        createLifecycleMessage(input.plugin, `lifecycle "${input.plugin.lifecycle}" not scheduled`),
      ),
    );
  }
  trackMaybePromise(
    input.pending,
    input.pipeline.extensions.use({
      key: input.plugin.key,
      register: input.plugin.register as never,
    }),
  );
};

const makeHookRegister = (lifecycle: string, hook: Plugin["hook"]) =>
  function registerHook() {
    return {
      lifecycle,
      hook: hook as never,
    };
  };

const registerHookExtension = (input: RegisterExtensionInput) => {
  const lifecycle = input.plugin.lifecycle ?? DEFAULT_LIFECYCLE;
  if (!isLifecycleScheduled(input.lifecycleSet, lifecycle)) {
    input.diagnostics.push(
      createLifecycleDiagnostic(
        createLifecycleMessage(input.plugin, describeMissingLifecycle(lifecycle)),
      ),
    );
    return;
  }
  const register = makeHookRegister(lifecycle, input.plugin.hook);
  trackMaybePromise(
    input.pending,
    input.pipeline.extensions.use({ key: input.plugin.key, register }),
  );
};

export const createDefaultReporter = (): PipelineReporter => ({
  warn: (message, context) => console.warn(message, context),
});

type RegisterExtensionsInput = {
  pipeline: PipelineWithExtensions;
  plugins: Plugin[];
  extensionPoints: string[];
  diagnostics: DiagnosticEntry[];
};

export const registerExtensions = (input: RegisterExtensionsInput) => {
  if (!hasExtensions(input.pipeline)) {
    input.diagnostics.push(
      createLifecycleDiagnostic("Pipeline extensions unavailable; plugin extensions skipped."),
    );
    return null;
  }

  const effectivePlugins = getEffectivePlugins(input.plugins);
  const lifecycleSet = new Set(input.extensionPoints);
  const pending: MaybePromise<unknown>[] = [];

  for (const plugin of effectivePlugins) {
    if (plugin.register) {
      registerPluginExtension({
        pipeline: input.pipeline,
        plugin,
        lifecycleSet,
        diagnostics: input.diagnostics,
        pending,
      });
      continue;
    }
    if (!plugin.hook) {
      continue;
    }
    registerHookExtension({
      pipeline: input.pipeline,
      plugin,
      lifecycleSet,
      diagnostics: input.diagnostics,
      pending,
    });
  }

  return maybeAll(pending);
};
