import type { AdapterBundle } from "./types";
import type { AdapterBundleKey } from "./bundle";

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

const registerBundleKey =
  <TKey extends AdapterBundleKey>(construct: TKey) =>
  (
    key: string,
    value: NonNullable<AdapterBundle[TKey]>,
    options?: AdapterPluginOptions,
  ): AdapterPlugin =>
    makePlugin(key, { [construct]: value } as AdapterBundle, options);

export const Adapter = {
  plugin(key: string, adapters: AdapterBundle, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, adapters, options);
  },
  model: registerBundleKey("model"),
  image: registerBundleKey("image"),
  tools: registerBundleKey("tools"),
  outputParser: registerBundleKey("outputParser"),
  indexing: registerBundleKey("indexing"),
  retriever: registerBundleKey("retriever"),
  queryEngine: registerBundleKey("queryEngine"),
  responseSynthesizer: registerBundleKey("responseSynthesizer"),
  memory: registerBundleKey("memory"),
  speech: registerBundleKey("speech"),
  transcription: registerBundleKey("transcription"),
  vectorStore: registerBundleKey("vectorStore"),
  cache: registerBundleKey("cache"),
  trace: registerBundleKey("trace"),
  eventStream: registerBundleKey("eventStream"),
  interrupt: registerBundleKey("interrupt"),
};
