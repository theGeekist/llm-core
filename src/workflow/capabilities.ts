// References: docs/workflow-notes.md (capability discovery)

import type { Plugin } from "./types";

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

export const buildCapabilities = (plugins: Plugin[]) => {
  const capabilities: Record<string, unknown> = {};

  for (const plugin of plugins) {
    if (!plugin.capabilities) {
      continue;
    }

    for (const [key, value] of Object.entries(plugin.capabilities)) {
      addCapability(capabilities, key, value);
    }
  }

  return capabilities;
};
