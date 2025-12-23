import {
  createHelper,
  makePipeline,
  type PipelineDiagnostic,
  type PipelineReporter,
} from "@wpkernel/pipeline/core";
import type { AdapterBundle, AdapterDiagnostic } from "./types";
import { mapMaybe, type MaybePromise } from "../maybe";
import { createBuiltinModel } from "./primitives/model";
import { createBuiltinTools } from "./primitives/tools";
import { createBuiltinRetriever } from "./primitives/retriever";
import { createBuiltinTrace } from "./primitives/trace";
import { validateAdapterRequirements } from "./requirements";

export type AdapterConstructName = keyof AdapterBundle | string;
export type AdapterProviderKey = string;
export type AdapterProviderId = string;

export type ConstructRequirement = {
  name: AdapterConstructName;
  required?: boolean;
  capabilities?: string[];
  dependsOn?: string[];
};

export type AdapterRegistryResolveInput = {
  constructs: ConstructRequirement[];
  providers?: Record<string, string>;
  defaults?: Record<string, string>;
  reporter?: PipelineReporter;
};

export type AdapterRegistryResolveResult = {
  adapters: AdapterBundle;
  diagnostics: AdapterDiagnostic[];
  providers: Record<string, string>;
  constructs: Record<string, unknown>;
};

export type AdapterProviderFactoryOptions = {
  construct: AdapterConstructName;
  providerKey: AdapterProviderKey;
  providerId: AdapterProviderId;
  requirement?: ConstructRequirement;
};

export type AdapterProviderFactory<T = unknown> = (
  options: AdapterProviderFactoryOptions,
) => MaybePromise<T>;

export type AdapterProviderRegistration<T = unknown> = {
  construct: AdapterConstructName;
  providerKey: AdapterProviderKey;
  id: AdapterProviderId;
  priority?: number;
  capabilities?: string[];
  dependsOn?: string[];
  override?: boolean;
  factory: AdapterProviderFactory<T>;
};

export type AdapterConstructRegistration = {
  name: AdapterConstructName;
};

export type AdapterRegistrySnapshot = {
  constructs: AdapterConstructRegistration[];
  providers: AdapterProviderRegistration[];
  diagnostics: AdapterDiagnostic[];
};

export type AdapterRegistry = {
  registerConstruct: (construct: AdapterConstructRegistration) => void;
  registerProvider: (provider: AdapterProviderRegistration) => void;
  resolve: (request: AdapterRegistryResolveInput) => MaybePromise<AdapterRegistryResolveResult>;
  listConstructs: () => AdapterConstructRegistration[];
  listProviders: (construct: AdapterConstructName) => AdapterProviderRegistration[];
  snapshot: () => AdapterRegistrySnapshot;
};

type RegistryState = {
  adapters: AdapterBundle;
  diagnostics: AdapterDiagnostic[];
  providers: Record<string, string>;
  constructs: Record<string, unknown>;
};

type RegistryContext = {
  reporter: PipelineReporter;
  request: AdapterRegistryResolveInput;
};

const createDefaultReporter = (): PipelineReporter => ({
  warn: (message, context) => console.warn(message, context),
});

const warn = (message: string, data?: unknown): AdapterDiagnostic => ({
  level: "warn",
  message,
  data,
});

const registryDiagnostic = (
  level: "warn" | "error",
  code: string,
  data?: Record<string, unknown>,
): AdapterDiagnostic => ({
  level,
  message: code,
  data,
});

const pipelineDiagnostic = (diagnostic: PipelineDiagnostic): AdapterDiagnostic =>
  warn("registry_pipeline_diagnostic", diagnostic);

const createState = (diagnostics: AdapterDiagnostic[]): RegistryState => ({
  adapters: {},
  diagnostics: [...diagnostics],
  providers: {},
  constructs: {},
});

// When adding a new construct, update AdapterBundle + this list.
const bundleKeys = new Set<keyof AdapterBundle>([
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
  "constructs",
]);

const isBundleKey = (key: AdapterConstructName): key is keyof AdapterBundle =>
  bundleKeys.has(key as keyof AdapterBundle) && key !== "constructs";

const addAdapterValue = (state: RegistryState, construct: AdapterConstructName, value: unknown) => {
  if (isBundleKey(construct)) {
    const bundle = state.adapters as Record<string, unknown>;
    bundle[construct] = value;
    return;
  }
  state.constructs[construct] = value;
};

const toRequirementMap = (requirements: ConstructRequirement[]) => {
  const map = new Map<AdapterConstructName, ConstructRequirement>();
  for (const requirement of requirements) {
    if (!map.has(requirement.name)) {
      map.set(requirement.name, requirement);
    }
  }
  return map;
};

const hasCapabilities = (required: string[] | undefined, available: string[] | undefined) => {
  if (!required || required.length === 0) {
    return true;
  }
  const set = new Set(available ?? []);
  return required.every((capability) => set.has(capability));
};

const pickHighestPriority = (providers: AdapterProviderRegistration[]) => {
  if (providers.length === 0) {
    return undefined;
  }
  const first = providers[0];
  if (!first) {
    return undefined;
  }
  let selected = first;
  let best = selected.priority ?? 0;
  for (const provider of providers.slice(1)) {
    const priority = provider.priority ?? 0;
    if (priority > best) {
      best = priority;
      selected = provider;
    }
  }
  return selected;
};

const hasPriorityConflict = (
  providers: AdapterProviderRegistration[],
  winner: AdapterProviderRegistration,
) => {
  const priority = winner.priority ?? 0;
  return providers.filter((provider) => (provider.priority ?? 0) === priority).length > 1;
};

const createReporters = (requirement: ConstructRequirement) => {
  const required = requirement.required ?? false;
  const level = required ? "error" : "warn";
  const diagnostics: AdapterDiagnostic[] = [];
  const report = (code: string, data?: Record<string, unknown>) => {
    diagnostics.push(registryDiagnostic(level, code, data));
  };
  const reportConflict = (entry: AdapterProviderRegistration) => {
    diagnostics.push(
      registryDiagnostic(level, "construct_provider_conflict", {
        construct: requirement.name,
        providerId: entry.id,
      }),
    );
  };
  return { diagnostics, report, reportConflict };
};

const selectById = (
  requirement: ConstructRequirement,
  entries: AdapterProviderRegistration[],
  providerId: string,
  report: (code: string, data?: Record<string, unknown>) => void,
) => {
  const selected = entries.find((entry) => entry.id === providerId);
  if (!selected) {
    report("construct_provider_not_found", { construct: requirement.name, providerId });
  }
  return selected;
};

const selectByPriority = (
  requirement: ConstructRequirement,
  entries: AdapterProviderRegistration[],
  report: (code: string, data?: Record<string, unknown>) => void,
  reportConflict: (entry: AdapterProviderRegistration) => void,
) => {
  const candidates = entries.filter((entry) =>
    hasCapabilities(requirement.capabilities, entry.capabilities),
  );
  if (candidates.length === 0) {
    if (entries.length > 0 && requirement.capabilities?.length) {
      report("construct_capability_missing", {
        construct: requirement.name,
        missing: requirement.capabilities,
      });
    } else {
      report("construct_provider_missing", { construct: requirement.name });
    }
    return undefined;
  }
  const selected = pickHighestPriority(candidates);
  if (!selected) {
    report("construct_provider_missing", { construct: requirement.name });
    return undefined;
  }
  if (hasPriorityConflict(candidates, selected)) {
    reportConflict(selected);
  }
  return selected;
};

const validateCapabilities = (
  requirement: ConstructRequirement,
  selected: AdapterProviderRegistration | undefined,
  report: (code: string, data?: Record<string, unknown>) => void,
) => {
  if (!selected) {
    return undefined;
  }
  if (hasCapabilities(requirement.capabilities, selected.capabilities)) {
    return selected;
  }
  report("construct_capability_missing", {
    construct: requirement.name,
    providerId: selected.id,
    missing: requirement.capabilities ?? [],
  });
  return undefined;
};

const resolveProviderSelection = (
  requirement: ConstructRequirement,
  entries: AdapterProviderRegistration[],
  overrides: Record<string, string>,
  defaults: Record<string, string>,
) => {
  const providerId = overrides[requirement.name] ?? defaults[requirement.name];
  const { diagnostics, report, reportConflict } = createReporters(requirement);
  const selected = providerId
    ? selectById(requirement, entries, providerId, report)
    : selectByPriority(requirement, entries, report, reportConflict);
  const validated = validateCapabilities(requirement, selected, report);
  return {
    selected: validated,
    diagnostics,
  };
};

export const createAdapterRegistry = (
  initialSnapshot?: AdapterRegistrySnapshot,
): AdapterRegistry => {
  const constructs = new Map<AdapterConstructName, AdapterConstructRegistration>();
  const providers = new Map<AdapterConstructName, AdapterProviderRegistration[]>();
  const registrationDiagnostics: AdapterDiagnostic[] = [];

  if (initialSnapshot) {
    for (const construct of initialSnapshot.constructs) {
      constructs.set(construct.name, construct);
    }
    for (const provider of initialSnapshot.providers) {
      const list = providers.get(provider.construct) ?? [];
      list.push(provider);
      providers.set(provider.construct, list);
    }
    registrationDiagnostics.push(...initialSnapshot.diagnostics);
  }

  const registerConstruct = (construct: AdapterConstructRegistration) => {
    if (constructs.has(construct.name)) {
      registrationDiagnostics.push(
        registryDiagnostic("warn", "construct_contract_conflict", { construct: construct.name }),
      );
      return;
    }
    constructs.set(construct.name, construct);
  };

  const registerProvider = (provider: AdapterProviderRegistration) => {
    if (!constructs.has(provider.construct)) {
      registerConstruct({ name: provider.construct });
    }
    const list = providers.get(provider.construct) ?? [];
    const existingIndex = list.findIndex((entry) => entry.id === provider.id);
    if (existingIndex >= 0) {
      if (provider.override) {
        list[existingIndex] = provider;
      } else {
        registrationDiagnostics.push(
          registryDiagnostic("warn", "construct_provider_conflict", {
            construct: provider.construct,
            providerId: provider.id,
          }),
        );
        providers.set(provider.construct, list);
        return;
      }
    } else {
      list.push(provider);
    }
    providers.set(provider.construct, list);
  };

  const listProviders = (construct: AdapterConstructName) => providers.get(construct) ?? [];

  const resolve = (request: AdapterRegistryResolveInput) => {
    const requirements = toRequirementMap(request.constructs);
    const helperKinds = Array.from(requirements.keys());
    const pipeline = makePipeline<
      AdapterRegistryResolveInput,
      RegistryContext,
      PipelineReporter,
      RegistryState,
      PipelineDiagnostic,
      AdapterRegistryResolveResult
    >({
      helperKinds,
      createContext: (options) => ({
        reporter: options.reporter ?? createDefaultReporter(),
        request: options,
      }),
      createState: () => createState(registrationDiagnostics),
      createRunResult: ({ artifact, diagnostics }) => {
        const state = artifact as RegistryState;
        const dependencyDiagnostics = validateAdapterRequirements(
          state.adapters,
          state.constructs,
          state.providers,
        );
        return {
          adapters: state.adapters,
          diagnostics: state.diagnostics
            .concat(diagnostics.map(pipelineDiagnostic))
            .concat(dependencyDiagnostics),
          providers: state.providers,
          constructs: state.constructs,
        };
      },
    });

    for (const requirement of requirements.values()) {
      const overrides = request.providers ?? {};
      const defaults = request.defaults ?? {};
      const entries = listProviders(requirement.name);
      const preselection = resolveProviderSelection(requirement, entries, overrides, defaults);
      const dependencyList = requirement.dependsOn ?? [];
      if (preselection.selected && dependencyList.length > 0) {
        const available = new Set(requirements.keys());
        const missing = dependencyList.filter((dep) => !available.has(dep));
        if (missing.length > 0) {
          preselection.diagnostics.push(
            registryDiagnostic("warn", "construct_dependency_missing", {
              construct: requirement.name,
              providerId: preselection.selected.id,
              missing,
            }),
          );
        }
      }
      pipeline.use(
        createHelper<RegistryContext, unknown, unknown, PipelineReporter>({
          key: `registry:resolve:${requirement.name}`,
          kind: requirement.name,
          mode: "extend",
          priority: 0,
          // Registry resolution does not enforce construct dependencies; recipe wiring does.
          apply: (options) => {
            const state = (options as { userState?: RegistryState }).userState;
            if (!state) {
              return;
            }
            const req = requirements.get(requirement.name) ?? requirement;
            state.diagnostics.push(...preselection.diagnostics);
            const selected = preselection.selected;
            if (!selected) {
              return;
            }
            state.providers[requirement.name] = selected.id;
            return mapMaybe(
              selected.factory({
                construct: requirement.name,
                providerKey: selected.providerKey,
                providerId: selected.id,
                requirement: req,
              }),
              (value) => addAdapterValue(state, requirement.name, value),
            );
          },
        }),
      );
    }

    return pipeline.run(request);
  };

  const listConstructs = () => Array.from(constructs.values());

  const snapshot = () => ({
    constructs: listConstructs(),
    providers: Array.from(providers.values()).flat(),
    diagnostics: [...registrationDiagnostics],
  });

  return {
    registerConstruct,
    registerProvider,
    resolve,
    listConstructs,
    listProviders,
    snapshot,
  };
};

const registerBuiltins = (registry: AdapterRegistry) => {
  registry.registerConstruct({ name: "model" });
  registry.registerConstruct({ name: "tools" });
  registry.registerConstruct({ name: "retriever" });
  registry.registerConstruct({ name: "trace" });
  registry.registerProvider({
    construct: "model",
    providerKey: "builtin",
    id: "builtin:model",
    priority: 0,
    factory: () => createBuiltinModel(),
  });
  registry.registerProvider({
    construct: "tools",
    providerKey: "builtin",
    id: "builtin:tools",
    priority: 0,
    factory: () => createBuiltinTools(),
  });
  registry.registerProvider({
    construct: "retriever",
    providerKey: "builtin",
    id: "builtin:retriever",
    priority: 0,
    factory: () => createBuiltinRetriever(),
  });
  registry.registerProvider({
    construct: "trace",
    providerKey: "builtin",
    id: "builtin:trace",
    priority: 0,
    factory: () => createBuiltinTrace(),
  });
};

let defaultRegistry: AdapterRegistry | undefined;

export const getDefaultAdapterRegistry = () => {
  if (!defaultRegistry) {
    const registry = createAdapterRegistry();
    registerBuiltins(registry);
    defaultRegistry = registry;
  }
  return defaultRegistry;
};

export const createRegistryFromDefaults = () =>
  createAdapterRegistry(getDefaultAdapterRegistry().snapshot());
