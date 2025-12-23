import type {
  AdapterBundle,
  AdapterDiagnostic,
  AdapterMetadata,
  AdapterRequirement,
} from "./types";

type RequirementSource = {
  construct: string;
  providerId?: string;
  requirements: AdapterRequirement[];
};

const warn = (message: string, data?: Record<string, unknown>): AdapterDiagnostic => ({
  level: "warn",
  message,
  data,
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRequirement = (value: unknown): value is AdapterRequirement =>
  isObject(value) &&
  typeof value.kind === "string" &&
  typeof value.name === "string" &&
  (value.kind === "construct" || value.kind === "capability");

const readMetadataRequirements = (value: unknown): AdapterRequirement[] => {
  if (Array.isArray(value)) {
    return value.flatMap(readMetadataRequirements);
  }
  if (!isObject(value)) {
    return [];
  }
  const metadata = (value as { metadata?: AdapterMetadata }).metadata;
  if (!metadata || !Array.isArray(metadata.requires)) {
    return [];
  }
  return metadata.requires.filter(isRequirement);
};

const addSource = (
  sources: RequirementSource[],
  construct: string,
  providerId: string | undefined,
  value: unknown,
) => {
  const requirements = readMetadataRequirements(value);
  if (requirements.length === 0) {
    return;
  }
  sources.push({ construct, providerId, requirements });
};

const listBundleEntries = (adapters: AdapterBundle): Array<[string, unknown]> => [
  ["documents", adapters.documents],
  ["messages", adapters.messages],
  ["tools", adapters.tools],
  ["model", adapters.model],
  ["trace", adapters.trace],
  ["prompts", adapters.prompts],
  ["schemas", adapters.schemas],
  ["textSplitter", adapters.textSplitter],
  ["embedder", adapters.embedder],
  ["retriever", adapters.retriever],
  ["reranker", adapters.reranker],
  ["loader", adapters.loader],
  ["transformer", adapters.transformer],
  ["memory", adapters.memory],
  ["storage", adapters.storage],
  ["kv", adapters.kv],
];

const listRequirementEntries = (adapters: AdapterBundle): Array<[string, unknown]> => [
  ["model", adapters.model],
  ["trace", adapters.trace],
  ["textSplitter", adapters.textSplitter],
  ["embedder", adapters.embedder],
  ["retriever", adapters.retriever],
  ["reranker", adapters.reranker],
  ["loader", adapters.loader],
  ["transformer", adapters.transformer],
  ["memory", adapters.memory],
  ["storage", adapters.storage],
  ["kv", adapters.kv],
];

const hasItems = (value: unknown) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

const buildCapabilityPresence = (adapters: AdapterBundle, constructs: Record<string, unknown>) => {
  const capabilities: Record<string, boolean> = {};
  for (const [key, value] of listBundleEntries(adapters)) {
    const present = hasItems(value);
    if (present) {
      capabilities[key] = true;
    }
  }
  for (const key of Object.keys(constructs)) {
    capabilities[key] = true;
  }
  return capabilities;
};

const hasConstruct = (
  adapters: AdapterBundle,
  constructs: Record<string, unknown>,
  name: string,
) => {
  const value = (adapters as Record<string, unknown>)[name];
  if (hasItems(value)) {
    return true;
  }
  return name in constructs;
};

export const readAdapterRequirements = (
  adapters: AdapterBundle,
  constructs: Record<string, unknown>,
  providers: Record<string, string>,
): RequirementSource[] => {
  const sources: RequirementSource[] = [];
  for (const [key, value] of listRequirementEntries(adapters)) {
    addSource(sources, key, providers[key], value);
  }
  for (const [key, value] of Object.entries(constructs)) {
    addSource(sources, key, providers[key], value);
  }
  return sources;
};

export const validateAdapterRequirements = (
  adapters: AdapterBundle,
  constructs: Record<string, unknown>,
  providers: Record<string, string>,
): AdapterDiagnostic[] => {
  const diagnostics: AdapterDiagnostic[] = [];
  const capabilityPresence = buildCapabilityPresence(adapters, constructs);
  const sources = readAdapterRequirements(adapters, constructs, providers);

  const pushConstructMissing = (source: RequirementSource, requirement: AdapterRequirement) => {
    diagnostics.push(
      warn(
        `Construct "${source.construct}" (${source.providerId ?? "unknown"}) requires ` +
          `construct "${requirement.name}" but none was resolved.`,
        {
          code: "construct_dependency_missing",
          construct: source.construct,
          providerId: source.providerId,
          missing: requirement.name,
        },
      ),
    );
  };

  const pushCapabilityMissing = (source: RequirementSource, requirement: AdapterRequirement) => {
    diagnostics.push(
      warn(
        `Construct "${source.construct}" (${source.providerId ?? "unknown"}) requires ` +
          `capability "${requirement.name}" but it is missing.`,
        {
          code: "capability_dependency_missing",
          construct: source.construct,
          providerId: source.providerId,
          missing: requirement.name,
        },
      ),
    );
  };

  for (const source of sources) {
    for (const requirement of source.requirements) {
      if (requirement.kind === "construct") {
        if (!hasConstruct(adapters, constructs, requirement.name)) {
          pushConstructMissing(source, requirement);
        }
        continue;
      }
      if (!capabilityPresence[requirement.name]) {
        pushCapabilityMissing(source, requirement);
      }
    }
  }

  return diagnostics;
};
