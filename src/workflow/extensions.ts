import { isPromiseLike, maybeAll, type PipelineReporter } from "@wpkernel/pipeline/core";
import type { PipelineWithExtensions, Plugin } from "./types";
import { createLifecycleDiagnostic, type DiagnosticEntry } from "./diagnostics";
import { getEffectivePlugins } from "./plugins/effective";

const DEFAULT_LIFECYCLE = "init";

const createLifecycleMessage = (plugin: Plugin, reason: string) =>
  `Plugin "${plugin.key}" extension skipped (${reason}).`;

const hasExtensions = (pipeline: PipelineWithExtensions) =>
  !!pipeline.extensions && typeof pipeline.extensions.use === "function";

const trackMaybePromise = (pending: Promise<unknown>[], value: unknown) => {
  if (isPromiseLike(value)) {
    pending.push(Promise.resolve(value));
  }
};

const isLifecycleScheduled = (lifecycleSet: Set<string>, lifecycle: string) =>
  lifecycleSet.has(lifecycle);

const describeMissingLifecycle = (lifecycle: string) =>
  lifecycle === DEFAULT_LIFECYCLE
    ? `default lifecycle "${DEFAULT_LIFECYCLE}" not scheduled`
    : `lifecycle "${lifecycle}" not scheduled`;

const registerPluginExtension = (
  pipeline: PipelineWithExtensions,
  plugin: Plugin,
  lifecycleSet: Set<string>,
  diagnostics: DiagnosticEntry[],
  pending: Promise<unknown>[],
) => {
  if (plugin.lifecycle && !isLifecycleScheduled(lifecycleSet, plugin.lifecycle)) {
    diagnostics.push(
      createLifecycleDiagnostic(
        createLifecycleMessage(plugin, `lifecycle "${plugin.lifecycle}" not scheduled`),
      ),
    );
  }
  trackMaybePromise(
    pending,
    pipeline.extensions.use({
      key: plugin.key,
      register: plugin.register as never,
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

const registerHookExtension = (
  pipeline: PipelineWithExtensions,
  plugin: Plugin,
  lifecycleSet: Set<string>,
  diagnostics: DiagnosticEntry[],
  pending: Promise<unknown>[],
) => {
  const lifecycle = plugin.lifecycle ?? DEFAULT_LIFECYCLE;
  if (!isLifecycleScheduled(lifecycleSet, lifecycle)) {
    diagnostics.push(
      createLifecycleDiagnostic(
        createLifecycleMessage(plugin, describeMissingLifecycle(lifecycle)),
      ),
    );
    return;
  }
  const register = makeHookRegister(lifecycle, plugin.hook);
  trackMaybePromise(pending, pipeline.extensions.use({ key: plugin.key, register }));
};

export const createDefaultReporter = (): PipelineReporter => ({
  warn: (message, context) => console.warn(message, context),
});

export const registerExtensions = (
  pipeline: PipelineWithExtensions,
  plugins: Plugin[],
  extensionPoints: string[],
  diagnostics: DiagnosticEntry[],
) => {
  if (!hasExtensions(pipeline)) {
    diagnostics.push(
      createLifecycleDiagnostic("Pipeline extensions unavailable; plugin extensions skipped."),
    );
    return;
  }

  const effectivePlugins = getEffectivePlugins(plugins);
  const lifecycleSet = new Set(extensionPoints);
  const pending: Promise<unknown>[] = [];

  for (const plugin of effectivePlugins) {
    if (plugin.register) {
      registerPluginExtension(pipeline, plugin, lifecycleSet, diagnostics, pending);
      continue;
    }
    if (!plugin.hook) {
      continue;
    }
    registerHookExtension(pipeline, plugin, lifecycleSet, diagnostics, pending);
  }

  return maybeAll(pending);
};
