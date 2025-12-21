// References: docs/workflow-notes.md (capability discovery)

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
};

const addCapability = (capabilities: Record<string, unknown>, key: string, value: unknown) => {
  const reducer = capabilityReducers[key] ?? mergeArrays;
  capabilities[key] = reducer(capabilities[key], value);
};

const collectDeclaredCapabilities = (plugins: Plugin[]) => {
  const declared: Record<string, unknown> = {};

  for (const plugin of plugins) {
    if (!plugin.capabilities) {
      continue;
    }
    for (const [capKey, capValue] of Object.entries(plugin.capabilities)) {
      addCapability(declared, capKey, capValue);
    }
  }

  return declared;
};

const collectResolvedCapabilities = (plugins: Plugin[]) => {
  const resolved: Record<string, unknown> = {};

  for (const plugin of plugins) {
    if (!plugin.capabilities) {
      continue;
    }
    for (const [capKey, capValue] of Object.entries(plugin.capabilities)) {
      addCapability(resolved, capKey, capValue);
    }
  }

  return resolved;
};

export const buildCapabilities = (plugins: Plugin[]): CapabilitiesSnapshot => {
  const declared = collectDeclaredCapabilities(plugins);
  const effective = getEffectivePlugins(plugins);
  const resolved = collectResolvedCapabilities(effective);
  return { declared, resolved };
};
