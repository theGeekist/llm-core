export type AdapterSource = "ai-sdk" | "langchain" | "llamaindex";
export type ProviderId = "openai" | "anthropic" | "ollama";

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

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type AgentProfile = {
  id: string;
  label: string;
  description: string;
  prompt: string;
};

export type ApprovalPolicyOption = {
  id: "never" | "on-request" | "unless-trusted" | "on-failure";
  label: string;
  description: string;
};

export type OptionItem = {
  id: string;
  label: string;
  description: string;
};

export type ToolPresetId = "search-only" | "web-search" | "custom";
export type SkillPresetId = "repo-skills" | "none" | "custom";
export type McpPresetId = "none" | "docs" | "custom";

export type ToolPreset = {
  id: ToolPresetId;
  label: string;
  description: string;
  tools: string[];
};

export type SkillPreset = {
  id: SkillPresetId;
  label: string;
  description: string;
  directories: string[];
  disabled?: string[];
};

export type McpPreset = {
  id: McpPresetId;
  label: string;
  description: string;
  servers: Record<string, unknown> | null;
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

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: "generalist",
    label: "Generalist",
    description: "Balanced planning and action, good for mixed tasks.",
    prompt:
      "You are a reliable agent. Plan before acting, use tools when helpful, and respond concisely.",
  },
  {
    id: "builder",
    label: "Builder",
    description: "Implementation-first, prefers concrete next steps.",
    prompt:
      "You are a builder. Translate goals into concrete steps, prefer working code, and call tools when needed.",
  },
  {
    id: "analyst",
    label: "Analyst",
    description: "Focuses on diagnosis, risk analysis, and careful tradeoffs.",
    prompt:
      "You are an analyst. Identify assumptions, evaluate tradeoffs, and surface risks before concluding.",
  },
];

export const APPROVAL_POLICIES: ApprovalPolicyOption[] = [
  {
    id: "never",
    label: "Never",
    description: "Tools run without approval.",
  },
  {
    id: "on-request",
    label: "On request",
    description: "Tools pause when the model asks for approval.",
  },
  {
    id: "unless-trusted",
    label: "Unless trusted",
    description: "Require approval unless the tool is trusted.",
  },
  {
    id: "on-failure",
    label: "On failure",
    description: "Approval only after tool failures.",
  },
];

export const TOOL_OPTIONS: OptionItem[] = [
  {
    id: "tools.search",
    label: "Search",
    description: "Query registered search tools.",
  },
  {
    id: "tools.web",
    label: "Web",
    description: "Allow web browsing tools.",
  },
];

export const SKILL_DIRECTORY_OPTIONS: OptionItem[] = [
  {
    id: "./skills",
    label: "Repo skills",
    description: "Load SKILL.md definitions from the repo.",
  },
];

export const TOOL_PRESETS: ToolPreset[] = [
  {
    id: "search-only",
    label: "Search only",
    description: "Allow only search tools.",
    tools: ["tools.search"],
  },
  {
    id: "web-search",
    label: "Web + search",
    description: "Allow search and web browsing tools.",
    tools: ["tools.search", "tools.web"],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Manually curate tool allowlists.",
    tools: [],
  },
];

export const SKILL_PRESETS: SkillPreset[] = [
  {
    id: "repo-skills",
    label: "Repo skills",
    description: "Load skills from ./skills.",
    directories: ["./skills"],
  },
  {
    id: "none",
    label: "None",
    description: "Disable skill loading.",
    directories: [],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Manually curate skill directories.",
    directories: [],
  },
];

export const MCP_PRESETS: McpPreset[] = [
  {
    id: "none",
    label: "None",
    description: "Do not connect to MCP servers.",
    servers: null,
  },
  {
    id: "docs",
    label: "Docs MCP",
    description: "Example MCP server for docs tooling.",
    servers: {
      docs: {
        type: "http",
        url: "https://example.com/mcp",
        tools: ["*"],
      },
    },
  },
  {
    id: "custom",
    label: "Custom",
    description: "Provide MCP servers JSON manually.",
    servers: null,
  },
];

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

const DEFAULT_PROFILE: AgentProfile =
  AGENT_PROFILES[0] ??
  ({
    id: "generalist",
    label: "Generalist",
    description: "Balanced planning and action, good for mixed tasks.",
    prompt:
      "You are a reliable agent. Plan before acting, use tools when helpful, and respond concisely.",
  } satisfies AgentProfile);

const toSelectOptionFromSource = (source: AdapterSourceOption): SelectOption => ({
  value: source.id,
  label: source.label,
});

const toSelectOptionFromProfile = (profile: AgentProfile): SelectOption => ({
  value: profile.id,
  label: profile.label,
});

const toSelectOptionFromPolicy = (policy: ApprovalPolicyOption): SelectOption => ({
  value: policy.id,
  label: policy.label,
});

const toSelectOptionFromToolPreset = (preset: ToolPreset): SelectOption => ({
  value: preset.id,
  label: preset.label,
});

const toSelectOptionFromSkillPreset = (preset: SkillPreset): SelectOption => ({
  value: preset.id,
  label: preset.label,
});

const toSelectOptionFromMcpPreset = (preset: McpPreset): SelectOption => ({
  value: preset.id,
  label: preset.label,
});

export const SOURCE_SELECT_OPTIONS: SelectOption[] = ADAPTER_SOURCES.map(toSelectOptionFromSource);
export const PROFILE_SELECT_OPTIONS: SelectOption[] = AGENT_PROFILES.map(toSelectOptionFromProfile);
export const APPROVAL_SELECT_OPTIONS: SelectOption[] =
  APPROVAL_POLICIES.map(toSelectOptionFromPolicy);
export const TOOL_PRESET_OPTIONS: SelectOption[] = TOOL_PRESETS.map(toSelectOptionFromToolPreset);
export const SKILL_PRESET_OPTIONS: SelectOption[] = SKILL_PRESETS.map(
  toSelectOptionFromSkillPreset,
);
export const MCP_PRESET_OPTIONS: SelectOption[] = MCP_PRESETS.map(toSelectOptionFromMcpPreset);

export const readProviderOption = (id: ProviderId): ProviderOption =>
  PROVIDERS.find((provider) => provider.id === id) ?? DEFAULT_PROVIDER;

export const readAgentProfile = (id: string): AgentProfile =>
  AGENT_PROFILES.find((profile) => profile.id === id) ?? DEFAULT_PROFILE;

export const readToolPreset = (id: ToolPresetId): ToolPreset =>
  TOOL_PRESETS.find((preset) => preset.id === id) ?? TOOL_PRESETS[0]!;

export const readSkillPreset = (id: SkillPresetId): SkillPreset =>
  SKILL_PRESETS.find((preset) => preset.id === id) ?? SKILL_PRESETS[0]!;

export const readMcpPreset = (id: McpPresetId): McpPreset =>
  MCP_PRESETS.find((preset) => preset.id === id) ?? MCP_PRESETS[0]!;

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
