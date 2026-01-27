import type {
  AgentApprovalsConfig,
  AgentLoopConfig,
  AgentMcpServerConfig,
  AgentSubagentOptions,
} from "@geekist/llm-core/interaction";
import {
  readMcpPreset,
  readSkillPreset,
  readToolPreset,
  type AgentProfile,
  type McpPreset,
  type SkillPreset,
  type ToolPreset,
} from "../demo-options";
import type { AgentConfigDraft, JsonParseResult, TransportData } from "./types";

const splitListInput = (value: string) => value.split(/[\n,]/g);
const trimListItem = (value: string) => value.trim();
const isNonEmpty = (value: string) => value.length > 0;

export const readListFromInput = (value: string) =>
  splitListInput(value).map(trimListItem).filter(isNonEmpty);

const formatListInput = (items: string[]) => items.join("\n");

const normalizeList = (items: string[]) => {
  const unique = Array.from(new Set(items));
  unique.sort();
  return unique;
};

export const toggleListInputValue = (value: string, entry: string) => {
  const list = readListFromInput(value);
  const normalized = normalizeList(list);
  const next = normalized.includes(entry)
    ? normalized.filter((item) => item !== entry)
    : normalizeList(normalized.concat(entry));
  return formatListInput(next);
};

const readOptionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readOptionalList = (value: string) => {
  const list = readListFromInput(value);
  return list.length > 0 ? list : undefined;
};

const readOptionalNumber = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const readOptionalJson = (value: string): JsonParseResult => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: null, error: "JSON must be an object." };
    }
    return { value: parsed, error: null };
  } catch {
    return { value: null, error: "Invalid JSON." };
  }
};

export const readMcpJsonStatus = (value: string): JsonParseResult => readOptionalJson(value);

const readMcpServers = (value: string): Record<string, AgentMcpServerConfig> | null => {
  const parsed = readOptionalJson(value);
  if (!parsed.value) {
    return null;
  }
  return parsed.value as Record<string, AgentMcpServerConfig>;
};

const formatMcpPresetValue = (preset: McpPreset) =>
  preset.servers ? JSON.stringify(preset.servers, null, 2) : "";

const applyToolPresetToDraft = (draft: AgentConfigDraft, preset: ToolPreset): AgentConfigDraft => ({
  ...draft,
  toolPresetId: preset.id,
  agentTools: formatListInput(preset.tools),
  toolAllowlist: formatListInput(preset.tools),
});

const applySkillPresetToDraft = (
  draft: AgentConfigDraft,
  preset: SkillPreset,
): AgentConfigDraft => ({
  ...draft,
  skillPresetId: preset.id,
  skillDirectories: formatListInput(preset.directories),
  skillDisabled: formatListInput(preset.disabled ?? []),
});

const applyMcpPresetToDraft = (draft: AgentConfigDraft, preset: McpPreset): AgentConfigDraft => ({
  ...draft,
  mcpPresetId: preset.id,
  mcpServersJson: formatMcpPresetValue(preset),
});

const readToolsConfig = (draft: AgentConfigDraft) => {
  const allowlist = readOptionalList(draft.toolAllowlist);
  const denylist = readOptionalList(draft.toolDenylist);
  if (!allowlist && !denylist) {
    return null;
  }
  return {
    allowlist,
    denylist,
  };
};

const readSkillsConfig = (draft: AgentConfigDraft) => {
  const directories = readOptionalList(draft.skillDirectories);
  const disabled = readOptionalList(draft.skillDisabled);
  if (!directories && !disabled) {
    return null;
  }
  return {
    directories,
    disabled,
  };
};

const readAgentTools = (draft: AgentConfigDraft) => {
  const tools = readOptionalList(draft.agentTools);
  return tools ?? null;
};

const readApprovalsConfig = (draft: AgentConfigDraft): AgentApprovalsConfig => {
  const cache = readOptionalText(draft.approvalsCache);
  return {
    policy: draft.approvalsPolicy,
    cache: cache === "session" ? "session" : undefined,
  };
};

const buildOutputContract = (value: string) => {
  const trimmed = readOptionalText(value);
  if (!trimmed) {
    return null;
  }
  return `Output format:\n${trimmed}`;
};

export const buildAgentContext = (draft: AgentConfigDraft) => {
  const parts = [readOptionalText(draft.context), buildOutputContract(draft.outputFormat)];
  const filtered = parts.filter((part): part is string => !!part);
  return filtered.length > 0 ? filtered.join("\n\n") : null;
};

export const buildAgentLoopConfig = (draft: AgentConfigDraft): AgentLoopConfig => ({
  agents: [
    {
      id: draft.agentId,
      name: draft.agentName,
      description: readOptionalText(draft.agentDescription) ?? undefined,
      prompt: draft.agentPrompt,
      tools: readAgentTools(draft),
      infer: true,
    },
  ],
  agentSelection: {
    agentId: draft.agentId,
    allowInfer: true,
  },
  tools: readToolsConfig(draft) ?? undefined,
  skills: readSkillsConfig(draft) ?? undefined,
  mcpServers: readMcpServers(draft.mcpServersJson) ?? undefined,
  approvals: readApprovalsConfig(draft),
});

export const buildSubagentOptions = (draft: AgentConfigDraft): AgentSubagentOptions | undefined => {
  if (!draft.subagentsEnabled) {
    return { enabled: false };
  }
  const maxActive = readOptionalNumber(draft.subagentsMaxActive);
  return {
    enabled: true,
    maxActive: maxActive ?? undefined,
    idPrefix: readOptionalText(draft.subagentsIdPrefix) ?? undefined,
  };
};

export const buildAgentDraft = (profile: AgentProfile): AgentConfigDraft => {
  const toolPreset = readToolPreset("search-only");
  const skillPreset = readSkillPreset("repo-skills");
  const mcpPreset = readMcpPreset("none");
  return applyMcpPresetToDraft(
    applySkillPresetToDraft(
      applyToolPresetToDraft(
        {
          profileId: profile.id,
          toolPresetId: toolPreset.id,
          skillPresetId: skillPreset.id,
          mcpPresetId: mcpPreset.id,
          agentId: "primary",
          agentName: profile.label,
          agentDescription: profile.description,
          agentPrompt: profile.prompt,
          agentTools: "",
          toolAllowlist: "",
          toolDenylist: "",
          skillDirectories: "",
          skillDisabled: "",
          mcpServersJson: "",
          approvalsPolicy: "on-request",
          approvalsCache: "session",
          subagentsEnabled: true,
          subagentsMaxActive: "4",
          subagentsIdPrefix: "subagent",
          context: "",
          outputFormat: "",
          threadId: "",
        },
        toolPreset,
      ),
      skillPreset,
    ),
    mcpPreset,
  );
};

export const applyTransportDraftUpdate = (
  transportData: TransportData,
  draft: AgentConfigDraft,
) => {
  transportData.agentConfig = buildAgentLoopConfig(draft);
  transportData.subagents = buildSubagentOptions(draft);
  transportData.context = buildAgentContext(draft) ?? undefined;
  transportData.threadId = readOptionalText(draft.threadId) ?? undefined;
  return true;
};

export const applyToolPreset = (draft: AgentConfigDraft, presetId: ToolPreset["id"]) =>
  applyToolPresetToDraft(draft, readToolPreset(presetId));

export const applySkillPreset = (draft: AgentConfigDraft, presetId: SkillPreset["id"]) =>
  applySkillPresetToDraft(draft, readSkillPreset(presetId));

export const applyMcpPreset = (draft: AgentConfigDraft, presetId: McpPreset["id"]) =>
  applyMcpPresetToDraft(draft, readMcpPreset(presetId));
