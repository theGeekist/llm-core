// References: docs/workflow-notes.md (capability discovery)

import type { AdapterBundle } from "../adapters/types";
import type { CapabilitiesSnapshot, Plugin } from "./types";
import { getEffectivePlugins } from "./plugins/effective";

type CapabilityReducer = (prev: unknown, next: unknown) => unknown;

const replace: CapabilityReducer = (_prev, next) => next;

const mergeArrays: CapabilityReducer = (prev, next) => {
  if (prev === undefined) {
    return next;
  }
  if (Array.isArray(prev)) {
    return Array.isArray(next) ? [...prev, ...next] : [...prev, next];
  }
  return Array.isArray(next) ? [prev, ...next] : [prev, next];
};

const capabilityReducers: Record<string, CapabilityReducer> = {
  tools: mergeArrays,
  retriever: replace,
  model: replace,
  evaluator: replace,
  embedder: replace,
  hitl: replace,
  recipe: replace,
  trace: replace,
  dataset: replace,
  textSplitter: replace,
  reranker: replace,
  loader: replace,
  transformer: replace,
  memory: replace,
  storage: replace,
  kv: replace,
  prompts: replace,
  schemas: replace,
  documents: replace,
  messages: replace,
};

const addCapability = (capabilities: Record<string, unknown>, key: string, value: unknown) => {
  const reducer = capabilityReducers[key] ?? mergeArrays;
  capabilities[key] = reducer(capabilities[key], value);
};

const addAdapterCapability = (
  capabilities: Record<string, unknown>,
  key: string,
  value: unknown,
) => {
  if (value === undefined) {
    return;
  }
  if (capabilities[key] !== undefined) {
    return;
  }
  capabilities[key] = value;
};

const hasItems = (values: unknown) => (Array.isArray(values) ? values.length > 0 : Boolean(values));

const addAdapterCapabilities = (
  capabilities: Record<string, unknown>,
  adapters?: AdapterBundle,
) => {
  if (!adapters) {
    return;
  }
  const entries: Array<[string, unknown]> = [
    ["documents", hasItems(adapters.documents) ? true : undefined],
    ["messages", hasItems(adapters.messages) ? true : undefined],
    ["tools", hasItems(adapters.tools) ? true : undefined],
    ["prompts", hasItems(adapters.prompts) ? true : undefined],
    ["schemas", hasItems(adapters.schemas) ? true : undefined],
    ["textSplitter", adapters.textSplitter],
    ["embedder", adapters.embedder],
    ["retriever", adapters.retriever],
    ["reranker", adapters.reranker],
    ["loader", adapters.loader],
    ["transformer", adapters.transformer],
    ["memory", adapters.memory],
    ["storage", adapters.storage],
    ["kv", adapters.kv],
  ];
  for (const [key, value] of entries) {
    addAdapterCapability(capabilities, key, value);
  }
};

const collectExplicitCapabilities = (plugins: Plugin[]) => {
  const snapshot: Record<string, unknown> = {};

  for (const plugin of plugins) {
    if (!plugin.capabilities) {
      continue;
    }
    for (const [capKey, capValue] of Object.entries(plugin.capabilities)) {
      addCapability(snapshot, capKey, capValue);
    }
  }

  return snapshot;
};

const applyAdapterPresence = (capabilities: Record<string, unknown>, plugins: Plugin[]) => {
  for (const plugin of plugins) {
    addAdapterCapabilities(capabilities, plugin.adapters);
  }
};

export const buildCapabilities = (plugins: Plugin[]): CapabilitiesSnapshot => {
  const declared = collectExplicitCapabilities(plugins);
  applyAdapterPresence(declared, plugins);
  const effective = getEffectivePlugins(plugins);
  const resolved = collectExplicitCapabilities(effective);
  applyAdapterPresence(resolved, effective);
  return { declared, resolved };
};
