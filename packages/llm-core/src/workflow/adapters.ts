// References: docs/stage-7.md (normalized adapter contracts)

import type { AdapterBundle } from "#adapters/types";
import { adapterBundleKeys, isAdapterBundleKey, mergeAdapterBundles } from "#adapters/bundle";
import type { ConstructRequirement, AdapterProviderRegistration } from "#adapters/registry";
import { createAdapterRegistry } from "#adapters/registry";
import type { Plugin } from "./types";
import { getEffectivePlugins } from "./plugins/effective";

export const collectAdapters = (plugins: Plugin[]) => {
  const effective = getEffectivePlugins(plugins);
  let bundle: AdapterBundle = {};

  for (const plugin of effective) {
    if (!plugin.adapters) {
      continue;
    }
    bundle = mergeAdapterBundles(bundle, plugin.adapters);
  }

  return bundle;
};

const toProviderId = (pluginKey: string, construct: string) => `${pluginKey}:${construct}`;

const toRegistrations = (plugin: Plugin, bundle: AdapterBundle): AdapterProviderRegistration[] => {
  const entries: AdapterProviderRegistration[] = [];
  for (const construct of adapterBundleKeys) {
    const value = bundle[construct];
    if (value === undefined) {
      continue;
    }
    entries.push({
      construct,
      providerKey: plugin.key,
      id: toProviderId(plugin.key, construct),
      priority: 10,
      override: plugin.mode === "override",
      factory: () => value,
    });
  }
  if (bundle.constructs) {
    for (const [construct, value] of Object.entries(bundle.constructs)) {
      if (value === undefined) {
        continue;
      }
      entries.push({
        construct,
        providerKey: plugin.key,
        id: toProviderId(plugin.key, construct),
        priority: 10,
        override: plugin.mode === "override",
        factory: () => value,
      });
    }
  }
  return entries;
};

export const createRegistryFromPlugins = (plugins: Plugin[]) => {
  const registry = createAdapterRegistry();
  const effective = getEffectivePlugins(plugins);
  for (const plugin of effective) {
    if (!plugin.adapters) {
      continue;
    }
    for (const registration of toRegistrations(plugin, plugin.adapters)) {
      registry.registerProvider(registration);
    }
  }
  return registry;
};

const toConstructRequirements = (
  constructs: string[],
  required: boolean,
  deps?: Record<string, string[]>,
) =>
  constructs.map<ConstructRequirement>((name) => ({
    name,
    required,
    dependsOn: deps?.[name],
  }));

const toCapabilityConstructs = (minimumCapabilities: string[]) =>
  minimumCapabilities.filter(isAdapterBundleKey);

const collectOptionalConstructs = (plugins: Plugin[]) => {
  const optional = new Set<string>();
  const effective = getEffectivePlugins(plugins);
  for (const plugin of effective) {
    const bundle = plugin.adapters;
    if (!bundle) {
      continue;
    }
    for (const construct of adapterBundleKeys) {
      if (bundle[construct] !== undefined) {
        optional.add(construct);
      }
    }
    if (bundle.constructs) {
      for (const key of Object.keys(bundle.constructs)) {
        optional.add(key);
      }
    }
  }
  return Array.from(optional);
};

export const resolveConstructRequirements = (
  minimumCapabilities: string[],
  plugins: Plugin[],
  contractConstructs?: {
    required?: string[];
    optional?: string[];
    dependsOn?: Record<string, string[]>;
  },
) => {
  const required = contractConstructs?.required ?? toCapabilityConstructs(minimumCapabilities);
  const optional = contractConstructs?.optional ?? [];
  const pluginOptionals = collectOptionalConstructs(plugins);
  return [
    ...toConstructRequirements(required, true, contractConstructs?.dependsOn),
    ...toConstructRequirements(
      [...optional, ...pluginOptionals],
      false,
      contractConstructs?.dependsOn,
    ),
  ];
};
