import {
  createHelper,
  makePipeline,
  type PipelineDiagnostic,
  type PipelineReporter,
} from "@wpkernel/pipeline/core";
import type { AdapterBundle, AdapterDiagnostic } from "./types";
import { maybeMap, type MaybePromise } from "../maybe";
import { createBuiltinModel } from "./primitives/model";
import { createBuiltinTools } from "./primitives/tools";
import { createBuiltinRetriever } from "./primitives/retriever";
import { createBuiltinTrace } from "./primitives/trace";
import { validateAdapterRequirements } from "./requirements";
import {
  createDefaultReporter,
  pipelineDiagnostic,
  registryDiagnostic,
} from "./registry/diagnostics";
import { addAdapterValue, createState, type RegistryState } from "./registry/state";
import { createReporters, toRequirementMap } from "./registry/requirements";
import { resolveProviderSelection, validateCapabilities } from "./registry/selection";

export type AdapterConstructName = keyof AdapterBundle | string;

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
  providerKey: string;
  providerId: string;
  requirement?: ConstructRequirement;
};

export type AdapterProviderFactory<T = unknown> = (
  options: AdapterProviderFactoryOptions,
) => MaybePromise<T>;

export type AdapterProviderRegistration<T = unknown> = {
  construct: AdapterConstructName;
  providerKey: string;
  id: string;
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

type RegistryContext = {
  reporter: PipelineReporter;
  request: AdapterRegistryResolveInput;
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
      const { diagnostics, report, reportConflict } = createReporters(requirement);
      const preselection = resolveProviderSelection(
        requirement,
        entries,
        overrides,
        defaults,
        report,
        reportConflict,
      );
      const selected = validateCapabilities(requirement, preselection.selected, report);
      const dependencyList = requirement.dependsOn ?? [];
      if (selected && dependencyList.length > 0) {
        const available = new Set(requirements.keys());
        const missing = dependencyList.filter((dep) => !available.has(dep));
        if (missing.length > 0) {
          diagnostics.push(
            registryDiagnostic("warn", "construct_dependency_missing", {
              construct: requirement.name,
              providerId: selected.id,
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
            state.diagnostics.push(...diagnostics);
            if (!selected) {
              return;
            }
            state.providers[requirement.name] = selected.id;
            return maybeMap(
              (value) => addAdapterValue(state, requirement.name, value),
              selected.factory({
                construct: requirement.name,
                providerKey: selected.providerKey,
                providerId: selected.id,
                requirement: req,
              }),
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
