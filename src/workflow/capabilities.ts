// References: docs/workflow-notes.md (capability discovery)

import type { Plugin } from "./types";
import { getEffectivePlugins } from "./plugins/effective";

const mergeValues = (existing: unknown, incoming: unknown) => {
  if (existing === undefined) {
    return incoming;
  }

  if (Array.isArray(existing)) {
    return Array.isArray(incoming) ? [...existing, ...incoming] : [...existing, incoming];
  }

  return Array.isArray(incoming) ? [existing, ...incoming] : [existing, incoming];
};

const addCapability = (
  capabilities: Record<string, unknown>,
  key: string,
  value: unknown
) => {
  capabilities[key] = mergeValues(capabilities[key], value);
};

type CapabilitiesSnapshot = {
  declared: Record<string, unknown>;
  resolved: Record<string, unknown>;
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
