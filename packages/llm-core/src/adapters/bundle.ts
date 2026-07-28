import type { AdapterBundle } from "./types";

export type AdapterBundleKey = Exclude<keyof AdapterBundle, "constructs">;

type AdapterBundleDefinition = {
  merge: "append" | "replace";
  capability: "presence" | "value";
  readsRequirements: boolean;
};

const list = {
  merge: "append",
  capability: "presence",
  readsRequirements: false,
} as const;

const adapter = {
  merge: "replace",
  capability: "value",
  readsRequirements: true,
} as const;

/**
 * The runtime description of every first-class adapter construct.
 *
 * Keep construct-specific behavior here so merging, capability discovery,
 * registration, and requirement validation cannot drift independently.
 */
export const adapterBundleCatalogue = {
  cache: adapter,
  documents: list,
  embedder: adapter,
  eventStream: adapter,
  image: adapter,
  indexing: adapter,
  interrupt: adapter,
  kv: adapter,
  loader: adapter,
  memory: adapter,
  messages: list,
  model: adapter,
  outputParser: adapter,
  prompts: list,
  queryEngine: adapter,
  reranker: adapter,
  responseSynthesizer: adapter,
  retriever: adapter,
  schemas: list,
  skills: adapter,
  speech: adapter,
  storage: adapter,
  textSplitter: adapter,
  tools: list,
  trace: adapter,
  transcription: adapter,
  transformer: adapter,
  vectorStore: adapter,
} as const satisfies Record<AdapterBundleKey, AdapterBundleDefinition>;

export const adapterBundleKeys = Object.keys(adapterBundleCatalogue) as AdapterBundleKey[];

export const isAdapterBundleKey = (key: string): key is AdapterBundleKey =>
  Object.hasOwn(adapterBundleCatalogue, key);

export const listAdapterBundleEntries = (bundle: AdapterBundle) =>
  adapterBundleKeys.map((key) => [key, bundle[key]] as const);

export const hasAdapterValue = (value: unknown) =>
  Array.isArray(value) ? value.length > 0 : Boolean(value);

export const toAdapterCapability = (key: AdapterBundleKey, value: unknown) =>
  adapterBundleCatalogue[key].capability === "presence"
    ? hasAdapterValue(value)
      ? true
      : undefined
    : value;

export const listRequirementAdapterEntries = (bundle: AdapterBundle) =>
  listAdapterBundleEntries(bundle).filter(([key]) => adapterBundleCatalogue[key].readsRequirements);

export const mergeAdapterBundles = (target: AdapterBundle, next: AdapterBundle): AdapterBundle => {
  const merged = { ...target } as Record<string, unknown>;

  for (const [key, nextValue] of listAdapterBundleEntries(next)) {
    if (nextValue === undefined || nextValue === null) {
      continue;
    }
    if (adapterBundleCatalogue[key].merge === "append") {
      const current = target[key];
      merged[key] = [
        ...(Array.isArray(current) ? current : []),
        ...(nextValue as readonly unknown[]),
      ];
    } else {
      merged[key] = nextValue;
    }
  }

  if (target.constructs || next.constructs) {
    merged.constructs = {
      ...(target.constructs ?? {}),
      ...(next.constructs ?? {}),
    };
  }

  return merged as AdapterBundle;
};
