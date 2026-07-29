import type { AdapterBundle } from "./types";
import type { AdapterBundleKey } from "./bundle";

export type AdapterPlugin = {
  key: string;
  adapters: AdapterBundle;
  capabilities?: Record<string, unknown>;
  mode?: "extend" | "override";
  overrideKey?: string;
};

type AdapterPluginOptions = Omit<AdapterPlugin, "key" | "adapters">;

export type AdapterRegistration<TKey extends AdapterBundleKey> = AdapterPluginOptions & {
  key: string;
  value: NonNullable<AdapterBundle[TKey]>;
};

const registerBundleKey =
  <TKey extends AdapterBundleKey>(construct: TKey) =>
  ({ key, value, ...options }: AdapterRegistration<TKey>): AdapterPlugin => ({
    key,
    adapters: { [construct]: value } as AdapterBundle,
    ...options,
  });

export const Adapter = {
  plugin: (plugin: AdapterPlugin): AdapterPlugin => plugin,
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
