export type AdapterSource = "ai-sdk" | "langchain" | "llamaindex";
export type ProviderId = "openai" | "anthropic" | "ollama";
export type RecipeId = "agent" | "rag" | "simple-chat" | "hitl";

export type ModelOption = {
  id: string;
  label: string;
};

export type AdapterSourceOption = {
  id: AdapterSource;
  label: string;
  description: string;
};

export type ProviderOption = {
  id: ProviderId;
  label: string;
  requiresToken: boolean;
  authUrl: string | null;
  tokenPlaceholder: string;
  models: Partial<Record<AdapterSource, ModelOption[]>>;
};

export type RecipeOption = {
  id: RecipeId;
  label: string;
  description: string;
  packs: string[];
};

export type Preset = {
  id: string;
  title: string;
  description: string;
  recipeId: RecipeId;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  modelId: string;
  disabled?: boolean;
};

export type SelectOption = {
  value: string;
  label: string;
};

export const ADAPTER_SOURCES: AdapterSourceOption[] = [
  {
    id: "ai-sdk",
    label: "AI SDK",
    description: "Native ai-sdk providers with stream-first adapters.",
  },
  {
    id: "langchain",
    label: "LangChain",
    description: "LangChain chat models mapped to core Model.",
  },
  {
    id: "llamaindex",
    label: "LlamaIndex",
    description: "LlamaIndex LLMs mapped into core Model.",
  },
];

const OPENAI_MODELS: ModelOption[] = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "gpt-4o", label: "GPT-4o" },
];

const ANTHROPIC_MODELS: ModelOption[] = [
  { id: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet" },
];

const OLLAMA_MODELS: ModelOption[] = [{ id: "llama3.1:8b", label: "Llama 3.1 8B" }];

export const PROVIDERS: ProviderOption[] = [
  {
    id: "openai",
    label: "OpenAI",
    requiresToken: true,
    authUrl: "https://platform.openai.com/api-keys",
    tokenPlaceholder: "sk-...",
    models: {
      "ai-sdk": OPENAI_MODELS,
      langchain: OPENAI_MODELS,
      llamaindex: OPENAI_MODELS,
    },
  },
  {
    id: "anthropic",
    label: "Anthropic",
    requiresToken: true,
    authUrl: "https://console.anthropic.com/settings/keys",
    tokenPlaceholder: "sk-ant-...",
    models: {
      "ai-sdk": ANTHROPIC_MODELS,
    },
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    requiresToken: false,
    authUrl: null,
    tokenPlaceholder: "ollama://localhost",
    models: {
      "ai-sdk": OLLAMA_MODELS,
      langchain: OLLAMA_MODELS,
    },
  },
];

export const RECIPES: RecipeOption[] = [
  {
    id: "simple-chat",
    label: "Simple Chat",
    description: "Single turn chat with streaming output.",
    packs: ["chat.simple"],
  },
  {
    id: "agent",
    label: "Agent",
    description: "Agent loop with tool support and trace hooks.",
    packs: ["agent", "tooling"],
  },
  {
    id: "rag",
    label: "RAG",
    description: "Retriever + synthesis with citations.",
    packs: ["rag", "agent"],
  },
  {
    id: "hitl",
    label: "HITL Gate",
    description: "Pause and resume with human approval.",
    packs: ["hitl"],
  },
];

export const PRESETS: Preset[] = [
  {
    id: "chat-copilot",
    title: "Chat Copilot",
    description: "Streaming assistant with minimal orchestration.",
    recipeId: "simple-chat",
    adapterSource: "ai-sdk",
    providerId: "openai",
    modelId: "gpt-4o-mini",
  },
  {
    id: "rag-qa",
    title: "RAG Q&A",
    description: "Retriever-backed answers with citations.",
    recipeId: "rag",
    adapterSource: "ai-sdk",
    providerId: "openai",
    modelId: "gpt-4o-mini",
  },
  {
    id: "hitl-gate",
    title: "HITL Gate",
    description: "Workflow pauses until a human approves.",
    recipeId: "hitl",
    adapterSource: "ai-sdk",
    providerId: "openai",
    modelId: "gpt-4o-mini",
  },
  {
    id: "multi-tool",
    title: "Multi-tool Agent",
    description: "Agent flow with pluggable tools and reasoning.",
    recipeId: "agent",
    adapterSource: "ai-sdk",
    providerId: "openai",
    modelId: "gpt-4o-mini",
  },
];

const DEFAULT_RECIPE: RecipeOption =
  RECIPES[0] ??
  ({
    id: "simple-chat",
    label: "Simple Chat",
    description: "Single turn chat with streaming output.",
    packs: ["chat.simple"],
  } satisfies RecipeOption);

const DEFAULT_PROVIDER: ProviderOption =
  PROVIDERS[0] ??
  ({
    id: "openai",
    label: "OpenAI",
    requiresToken: true,
    authUrl: "https://platform.openai.com/api-keys",
    tokenPlaceholder: "sk-...",
    models: {
      "ai-sdk": OPENAI_MODELS,
    },
  } satisfies ProviderOption);

const toSelectOptionFromRecipe = (recipe: RecipeOption): SelectOption => ({
  value: recipe.id,
  label: recipe.label,
});

const toSelectOptionFromSource = (source: AdapterSourceOption): SelectOption => ({
  value: source.id,
  label: source.label,
});

export const RECIPE_SELECT_OPTIONS: SelectOption[] = RECIPES.map(toSelectOptionFromRecipe);
export const SOURCE_SELECT_OPTIONS: SelectOption[] = ADAPTER_SOURCES.map(toSelectOptionFromSource);

export const readRecipeOption = (id: RecipeId): RecipeOption =>
  RECIPES.find((recipe) => recipe.id === id) ?? DEFAULT_RECIPE;

export const readProviderOption = (id: ProviderId): ProviderOption =>
  PROVIDERS.find((provider) => provider.id === id) ?? DEFAULT_PROVIDER;

export const readAvailableProviders = (source: AdapterSource) =>
  PROVIDERS.filter((provider) => (provider.models[source] ?? []).length > 0);

export const readAvailableModels = (source: AdapterSource, providerId: ProviderId) => {
  const provider = readProviderOption(providerId);
  return provider.models[source] ?? [];
};

export const readDefaultModel = (source: AdapterSource, providerId: ProviderId) => {
  const models = readAvailableModels(source, providerId);
  const first = models[0];
  if (first) {
    return first.id;
  }
  const fallback = OPENAI_MODELS[0];
  return fallback ? fallback.id : "gpt-4o-mini";
};

export const readPresetForSelection = (selection: {
  recipeId: RecipeId;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  modelId: string;
}) =>
  PRESETS.find(
    (preset) =>
      preset.recipeId === selection.recipeId &&
      preset.adapterSource === selection.adapterSource &&
      preset.providerId === selection.providerId &&
      preset.modelId === selection.modelId,
  ) ?? null;
