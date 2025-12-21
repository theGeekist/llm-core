// References: docs/workflow-notes.md (override semantics)

import type { Plugin } from "../types";

const overrideKey = (plugin: Plugin) => plugin.overrideKey ?? plugin.key;
const isOverride = (plugin: Plugin) => plugin.mode === "override";

export const getEffectivePlugins = (plugins: Plugin[]) => {
  const effective: Plugin[] = [];
  const indexByKey = new Map<string, number>();

  for (const plugin of plugins) {
    const key = overrideKey(plugin);
    const priorIndex = indexByKey.get(key);
    if (priorIndex === undefined) {
      effective.push(plugin);
      indexByKey.set(key, effective.length - 1);
    } else if (isOverride(plugin)) {
      effective[priorIndex] = plugin;
    }
  }

  return effective;
};
