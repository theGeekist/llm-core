import type { AdapterBundle, AdapterDiagnostic } from "./types";
import { maybeChain, maybeMap, type MaybePromise } from "#shared/maybe";
import { createBuiltinModel } from "./primitives/model";
import { createBuiltinTools } from "./primitives/tools";
import { createBuiltinRetriever } from "./primitives/retriever";
import { createBuiltinTrace } from "./primitives/trace";
import { validateAdapterRequirements } from "./requirements";
import { registryDiagnostic } from "./registry/diagnostics";
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

export type AdapterRegistry = {
  registerProvider: (provider: AdapterProviderRegistration) => void;
  resolve: (request: AdapterRegistryResolveInput) => MaybePromise<AdapterRegistryResolveResult>;
};

export const createAdapterRegistry = (): AdapterRegistry => {
  const providers = new Map<AdapterConstructName, AdapterProviderRegistration[]>();
  const registrationDiagnostics: AdapterDiagnostic[] = [];

  const registerProvider = (provider: AdapterProviderRegistration) => {
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
    let resolved: MaybePromise<RegistryState> = createState(registrationDiagnostics);
    for (const requirement of requirements.values()) {
      const overrides = request.providers ?? {};
      const defaults = request.defaults ?? {};
      const entries = listProviders(requirement.name);
      const { diagnostics, report, reportConflict } = createReporters(requirement);
      const preselection = resolveProviderSelection({
        requirement,
        entries,
        overrides,
        defaults,
        report,
        reportConflict,
      });
      const selected = validateCapabilities({
        requirement,
        selected: preselection.selected,
        report,
      });
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
      resolved = maybeChain((state) => {
        state.diagnostics.push(...diagnostics);
        if (!selected) {
          return state;
        }
        state.providers[requirement.name] = selected.id;
        return maybeMap(
          (value) => {
            addAdapterValue(state, requirement.name, value);
            return state;
          },
          selected.factory({
            construct: requirement.name,
            providerKey: selected.providerKey,
            providerId: selected.id,
            requirement,
          }),
        );
      }, resolved);
    }

    return maybeMap((state): AdapterRegistryResolveResult => {
      const dependencyDiagnostics = validateAdapterRequirements(
        state.adapters,
        state.constructs,
        state.providers,
      );
      return {
        adapters: state.adapters,
        diagnostics: state.diagnostics.concat(dependencyDiagnostics),
        providers: state.providers,
        constructs: state.constructs,
      };
    }, resolved);
  };

  for (const provider of builtinProviders) {
    registerProvider(provider);
  }

  return {
    registerProvider,
    resolve,
  };
};

const builtinProviders: AdapterProviderRegistration[] = [
  {
    construct: "model",
    providerKey: "builtin",
    id: "builtin:model",
    priority: 0,
    factory: () => createBuiltinModel(),
  },
  {
    construct: "tools",
    providerKey: "builtin",
    id: "builtin:tools",
    priority: 0,
    factory: () => createBuiltinTools(),
  },
  {
    construct: "retriever",
    providerKey: "builtin",
    id: "builtin:retriever",
    priority: 0,
    factory: () => createBuiltinRetriever(),
  },
  {
    construct: "trace",
    providerKey: "builtin",
    id: "builtin:trace",
    priority: 0,
    factory: () => createBuiltinTrace(),
  },
];
