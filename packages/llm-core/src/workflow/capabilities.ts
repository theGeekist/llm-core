// References: docs/workflow-notes.md (capability discovery)

import type { AdapterBundle } from "#adapters/types";
import { adapterBundleKeys, listAdapterBundleEntries, toAdapterCapability } from "#adapters/bundle";
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
  ...Object.fromEntries(adapterBundleKeys.map((key) => [key, replace])),
  tools: mergeArrays,
  evaluator: replace,
  hitl: replace,
  recipe: replace,
  dataset: replace,
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

const addAdapterCapabilities = (
  capabilities: Record<string, unknown>,
  adapters?: AdapterBundle,
) => {
  if (!adapters) {
    return;
  }
  for (const [key, value] of listAdapterBundleEntries(adapters)) {
    addAdapterCapability(capabilities, key, toAdapterCapability(key, value));
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

const applyAdapterPresenceFromPlugins = (
  capabilities: Record<string, unknown>,
  plugins: Plugin[],
) => {
  for (const plugin of plugins) {
    addAdapterCapabilities(capabilities, plugin.adapters);
  }
};

export const applyAdapterPresence = (
  capabilities: Record<string, unknown>,
  adapters?: AdapterBundle,
) => {
  addAdapterCapabilities(capabilities, adapters);
};

export const buildCapabilities = (plugins: Plugin[]): CapabilitiesSnapshot => {
  const declared = collectExplicitCapabilities(plugins);
  applyAdapterPresenceFromPlugins(declared, plugins);
  const effective = getEffectivePlugins(plugins);
  const resolved = collectExplicitCapabilities(effective);
  applyAdapterPresenceFromPlugins(resolved, effective);
  return { declared, resolved };
};
