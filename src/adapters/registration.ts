import type { AdapterBundle, Model, Retriever, Tool, AdapterTraceSink } from "./types";

export type AdapterPlugin = {
  key: string;
  adapters: AdapterBundle;
  capabilities?: Record<string, unknown>;
  mode?: "extend" | "override";
  overrideKey?: string;
};

export type AdapterPluginOptions = {
  capabilities?: Record<string, unknown>;
  mode?: "extend" | "override";
  overrideKey?: string;
};

const bundleKeys = new Set<keyof AdapterBundle>([
  "documents",
  "messages",
  "tools",
  "model",
  "trace",
  "prompts",
  "schemas",
  "textSplitter",
  "embedder",
  "retriever",
  "reranker",
  "loader",
  "transformer",
  "memory",
  "storage",
  "kv",
  "constructs",
]);

const isBundleKey = (construct: string): construct is keyof AdapterBundle =>
  bundleKeys.has(construct as keyof AdapterBundle) && construct !== "constructs";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const buildBundle = (construct: string, value: unknown): AdapterBundle => {
  if (isBundleKey(construct)) {
    return { [construct]: value } as AdapterBundle;
  }
  if (construct === "constructs") {
    // Allow a direct constructs map; non-objects are wrapped for convenience.
    return { constructs: isObject(value) ? value : { value } };
  }
  return { constructs: { [construct]: value } };
};

const makePlugin = (
  key: string,
  adapters: AdapterBundle,
  options?: AdapterPluginOptions,
): AdapterPlugin => ({
  key,
  adapters,
  capabilities: options?.capabilities,
  mode: options?.mode,
  overrideKey: options?.overrideKey,
});

export const Adapter = {
  plugin(key: string, adapters: AdapterBundle, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, adapters, options);
  },
  register(
    key: string,
    construct: string,
    value: unknown,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, buildBundle(construct, value), options);
  },
  model(key: string, model: Model, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { model }, options);
  },
  tools(key: string, tools: Tool[], options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { tools }, options);
  },
  retriever(key: string, retriever: Retriever, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { retriever }, options);
  },
  trace(key: string, trace: AdapterTraceSink, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { trace }, options);
  },
};
