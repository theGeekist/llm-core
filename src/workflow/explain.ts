// References: docs/implementation-plan.md#L51-L54,L124-L130; docs/recipes-and-plugins.md

import type { Plugin } from "./types";

export type ExplainSnapshot = {
  plugins: string[];
  overrides: string[];
  unused: string[];
  missingRequirements?: string[];
};

type ExplainInput = {
  plugins: Plugin[];
  capabilities: Record<string, unknown>;
};

const isOverride = (plugin: Plugin) => plugin.mode === "override";
const overrideKey = (plugin: Plugin) => plugin.overrideKey ?? plugin.key;

const recordOverride = (plugin: Plugin, prior: Plugin | undefined, overrides: string[]) => {
  if (!prior || !isOverride(plugin)) {
    return;
  }
  overrides.push(`${plugin.key} overrides ${prior.key}`);
};

const recordDuplicate = (plugin: Plugin, prior: Plugin | undefined, unused: string[]) => {
  if (!prior || isOverride(plugin)) {
    return;
  }
  unused.push(`${plugin.key} (duplicate key)`);
};

const recordMissingRequirements = (
  plugin: Plugin,
  capabilityKeys: Set<string>,
  missingRequirements: string[]
) => {
  if (!plugin.requires) {
    return;
  }
  for (const requirement of plugin.requires) {
    if (!capabilityKeys.has(requirement)) {
      missingRequirements.push(`${plugin.key} (requires ${requirement})`);
    }
  }
};

export const buildExplainSnapshot = ({ plugins, capabilities }: ExplainInput): ExplainSnapshot => {
  const overrides: string[] = [];
  const unused: string[] = [];
  const missingRequirements: string[] = [];
  const seenKeys = new Map<string, Plugin>();
  const capabilityKeys = new Set(Object.keys(capabilities));

  for (const plugin of plugins) {
    const key = overrideKey(plugin);
    const prior = seenKeys.get(key);
    recordOverride(plugin, prior, overrides);
    recordDuplicate(plugin, prior, unused);
    recordMissingRequirements(plugin, capabilityKeys, missingRequirements);
    seenKeys.set(key, plugin);
  }

  return {
    plugins: plugins.map((plugin) => plugin.key),
    overrides,
    unused,
    missingRequirements: missingRequirements.length ? missingRequirements : undefined,
  };
};
