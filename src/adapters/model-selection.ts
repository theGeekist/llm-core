import { createOpenAI, openai as aiOpenAI } from "@ai-sdk/openai";
import { createAnthropic, anthropic as aiAnthropic } from "@ai-sdk/anthropic";
import { createOllama } from "ollama-ai-provider-v2";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { openai as llamaOpenAI } from "@llamaindex/openai";
import { fromAiSdkModel, fromLangChainModel, fromLlamaIndexModel } from "./index";
import type { Model } from "./types";
import { bindFirst, compose } from "#shared/fp";

export type AdapterSource = "ai-sdk" | "langchain" | "llamaindex";
export type ProviderId = "openai" | "anthropic" | "ollama";

export type ModelSelection = {
  source?: AdapterSource | null;
  providerId?: ProviderId | null;
  modelId?: string | null;
  tokens?: Record<string, string> | null;
};

export type ModelOptions = Record<AdapterSource, Partial<Record<ProviderId, string[]>>>;

export type ModelSelectorOptions = {
  modelOptions?: ModelOptions;
  defaultSource?: AdapterSource;
  defaultProviders?: Partial<Record<AdapterSource, ProviderId>>;
  readToken?: (input: {
    providerId: ProviderId;
    tokens?: Record<string, string> | null;
  }) => string | null;
  readOllamaBaseUrl?: () => string;
};

const DEFAULT_MODEL_OPTIONS: ModelOptions = {
  "ai-sdk": {
    openai: ["gpt-4o-mini", "gpt-4o"],
    anthropic: ["claude-3-5-sonnet-20240620"],
    ollama: ["llama3.1:8b"],
  },
  langchain: {
    openai: ["gpt-4o-mini", "gpt-4o"],
    ollama: ["llama3.1:8b"],
  },
  llamaindex: {
    openai: ["gpt-4o-mini", "gpt-4o"],
  },
};

const DEFAULT_SOURCE: AdapterSource = "ai-sdk";

const DEFAULT_PROVIDER: Record<AdapterSource, ProviderId> = {
  "ai-sdk": "openai",
  langchain: "openai",
  llamaindex: "openai",
};

const readModelOptions = (options?: ModelSelectorOptions) =>
  options?.modelOptions ?? DEFAULT_MODEL_OPTIONS;

const readDefaultSource = (options?: ModelSelectorOptions) =>
  options?.defaultSource ?? DEFAULT_SOURCE;

const readDefaultProviderMap = (options?: ModelSelectorOptions) => ({
  ...DEFAULT_PROVIDER,
  ...(options?.defaultProviders ?? {}),
});

const readAdapterSource = (
  value: AdapterSource | null | undefined,
  options?: ModelSelectorOptions,
): AdapterSource => {
  const defaults = readDefaultSource(options);
  if (value === "ai-sdk" || value === "langchain" || value === "llamaindex") {
    return value;
  }
  return defaults;
};

const readProviderId = (
  source: AdapterSource,
  value: ProviderId | null | undefined,
  options?: ModelSelectorOptions,
): ProviderId => {
  const providers = Object.keys(readModelOptions(options)[source] ?? {}) as ProviderId[];
  if (value === "openai" || value === "anthropic" || value === "ollama") {
    if (providers.includes(value)) {
      return value;
    }
  }
  return readDefaultProviderMap(options)[source] ?? DEFAULT_PROVIDER[source];
};

const readModelId = (input: {
  source: AdapterSource;
  providerId: ProviderId;
  value?: string | null;
  options?: ModelSelectorOptions;
}): string => {
  const models = readModelOptions(input.options)[input.source]?.[input.providerId] ?? [];
  if (input.value && models.includes(input.value)) {
    return input.value;
  }
  return models[0] ?? "gpt-4o-mini";
};

const readEnv = () => {
  if (typeof process === "undefined") {
    return null;
  }
  if (!process.env) {
    return null;
  }
  return process.env;
};

const defaultReadToken = (input: {
  providerId: ProviderId;
  tokens?: Record<string, string> | null;
}) => {
  if (input.tokens && input.providerId in input.tokens) {
    return input.tokens[input.providerId] ?? null;
  }
  const env = readEnv();
  if (!env) {
    return null;
  }
  if (input.providerId === "openai") {
    return env.OPENAI_API_KEY ?? null;
  }
  if (input.providerId === "anthropic") {
    return env.ANTHROPIC_API_KEY ?? null;
  }
  return null;
};

const readToken = (
  input: { providerId: ProviderId; tokens?: Record<string, string> | null },
  options?: ModelSelectorOptions,
) => (options?.readToken ?? defaultReadToken)(input);

const readOllamaBaseUrl = (options?: ModelSelectorOptions) =>
  options?.readOllamaBaseUrl ? options.readOllamaBaseUrl() : "http://127.0.0.1:11434";

const createAiSdkAdapter = (input: {
  providerId: ProviderId;
  modelId: string;
  token: string | null;
  options?: ModelSelectorOptions;
}) => {
  if (input.providerId === "openai") {
    if (input.token) {
      const provider = createOpenAI({ apiKey: input.token });
      return fromAiSdkModel(provider(input.modelId));
    }
    return fromAiSdkModel(aiOpenAI(input.modelId));
  }
  if (input.providerId === "anthropic") {
    if (input.token) {
      const provider = createAnthropic({ apiKey: input.token });
      return fromAiSdkModel(provider(input.modelId));
    }
    return fromAiSdkModel(aiAnthropic(input.modelId));
  }
  const provider = createOllama({ baseURL: readOllamaBaseUrl(input.options) });
  return fromAiSdkModel(provider(input.modelId));
};

const readLangChainOpenAiOptions = (input: { modelId: string; token: string | null }) =>
  input.token ? { model: input.modelId, apiKey: input.token } : { model: input.modelId };

const readLlamaIndexOpenAiOptions = (input: { modelId: string; token: string | null }) =>
  input.token ? { model: input.modelId, apiKey: input.token } : { model: input.modelId };

type LangChainModel = Parameters<typeof fromLangChainModel>[0];

const castLangChainModel = (model: unknown) => model as LangChainModel;

const toLangChainAdapter = compose(fromLangChainModel, castLangChainModel);
const toLlamaIndexAdapter = compose(fromLlamaIndexModel, llamaOpenAI, readLlamaIndexOpenAiOptions);

const createLangChainAdapter = (input: {
  providerId: ProviderId;
  modelId: string;
  token: string | null;
  options?: ModelSelectorOptions;
}) => {
  if (input.providerId === "openai") {
    return toLangChainAdapter(
      new ChatOpenAI(readLangChainOpenAiOptions({ modelId: input.modelId, token: input.token })),
    );
  }
  const baseUrl = readOllamaBaseUrl(input.options);
  return toLangChainAdapter(new ChatOllama({ model: input.modelId, baseUrl }));
};

const createLlamaIndexAdapter = (modelId: string, token: string | null) =>
  toLlamaIndexAdapter({ modelId, token });

const selectModelWithOptions = (
  options: ModelSelectorOptions | undefined,
  selection?: ModelSelection | null,
): Model => {
  const source = readAdapterSource(selection?.source ?? null, options);
  const providerId = readProviderId(source, selection?.providerId ?? null, options);
  const modelId = readModelId({
    source,
    providerId,
    value: selection?.modelId ?? null,
    options,
  });
  const token = readToken({ providerId, tokens: selection?.tokens ?? null }, options);

  if (source === "ai-sdk") {
    return createAiSdkAdapter({ providerId, modelId, token, options });
  }
  if (source === "langchain") {
    return createLangChainAdapter({ providerId, modelId, token, options });
  }
  return createLlamaIndexAdapter(modelId, token);
};

export function selectModel(
  selection?: ModelSelection | null,
  options?: ModelSelectorOptions,
): Model;
export function selectModel(
  options?: ModelSelectorOptions,
): (selection?: ModelSelection | null) => Model;
export function selectModel(
  selection?: ModelSelection | null | ModelSelectorOptions,
  options?: ModelSelectorOptions,
) {
  if (arguments.length === 1 && selection && !("source" in selection)) {
    return bindFirst(selectModelWithOptions, selection as ModelSelectorOptions | undefined);
  }
  return selectModelWithOptions(options, selection as ModelSelection | null | undefined);
}
