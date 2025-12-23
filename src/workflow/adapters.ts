// References: docs/stage-7.md (normalized adapter contracts)

import type { AdapterBundle } from "../adapters/types";
import type { ConstructRequirement, AdapterProviderRegistration } from "../adapters/registry";
import { createRegistryFromDefaults } from "../adapters/registry";
import type { Plugin } from "./types";
import { getEffectivePlugins } from "./plugins/effective";

const adapterConstructs: Array<keyof AdapterBundle> = [
  "documents",
  "messages",
  "tools",
  "model",
  "trace",
  "prompts",
  "schemas",
  "textSplitter",
  "embedder",
  "retriever",
  "reranker",
  "loader",
  "transformer",
  "memory",
  "storage",
  "kv",
];

const mergeLists = <T>(left: T[] | undefined, right: T[] | undefined) =>
  right ? [...(left ?? []), ...right] : left;

const replaceIfDefined = <T>(current: T | undefined, next: T | undefined) =>
  next === undefined ? current : next;

const mergeIfDefined = <T>(current: T[] | undefined, next: T[] | undefined) =>
  next === undefined ? current : mergeLists(current, next);

const mergeAdapterBundle = (
  target: AdapterBundle,
  next: AdapterBundle,
  mode: Plugin["mode"],
): AdapterBundle => {
  if (mode === "override") {
    return { ...next };
  }
  const constructs =
    target.constructs || next.constructs
      ? { ...(target.constructs ?? {}), ...(next.constructs ?? {}) }
      : undefined;
  return {
    documents: mergeIfDefined(target.documents, next.documents),
    messages: mergeIfDefined(target.messages, next.messages),
    tools: mergeIfDefined(target.tools, next.tools),
    model: replaceIfDefined(target.model, next.model),
    trace: replaceIfDefined(target.trace, next.trace),
    prompts: mergeIfDefined(target.prompts, next.prompts),
    schemas: mergeIfDefined(target.schemas, next.schemas),
    textSplitter: replaceIfDefined(target.textSplitter, next.textSplitter),
    embedder: replaceIfDefined(target.embedder, next.embedder),
    retriever: replaceIfDefined(target.retriever, next.retriever),
    reranker: replaceIfDefined(target.reranker, next.reranker),
    loader: replaceIfDefined(target.loader, next.loader),
    transformer: replaceIfDefined(target.transformer, next.transformer),
    memory: replaceIfDefined(target.memory, next.memory),
    storage: replaceIfDefined(target.storage, next.storage),
    kv: replaceIfDefined(target.kv, next.kv),
    constructs,
  };
};

export const collectAdapters = (plugins: Plugin[]) => {
  const effective = getEffectivePlugins(plugins);
  let bundle: AdapterBundle = {};

  for (const plugin of effective) {
    if (!plugin.adapters) {
      continue;
    }
    bundle = mergeAdapterBundle(bundle, plugin.adapters, plugin.mode);
  }

  return bundle;
};

const toProviderId = (pluginKey: string, construct: string) => `${pluginKey}:${construct}`;

const toRegistrations = (plugin: Plugin, bundle: AdapterBundle): AdapterProviderRegistration[] => {
  const entries: AdapterProviderRegistration[] = [];
  for (const construct of adapterConstructs) {
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
  const registry = createRegistryFromDefaults();
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
  minimumCapabilities.filter((capability) =>
    adapterConstructs.includes(capability as keyof AdapterBundle),
  );

const collectOptionalConstructs = (plugins: Plugin[]) => {
  const optional = new Set<string>();
  const effective = getEffectivePlugins(plugins);
  for (const plugin of effective) {
    const bundle = plugin.adapters;
    if (!bundle) {
      continue;
    }
    for (const construct of adapterConstructs) {
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
