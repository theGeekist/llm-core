import type { Tool } from "#adapters/types";
import type { AgentDefinition, AgentLoopConfig } from "./types";

export type AgentExecutionProfile = {
  selectedAgent: AgentDefinition | null;
  toolAllowlist: string[] | null;
  toolDenylist: string[];
};

const normalizeNameList = (values?: string[] | null): string[] | null => {
  if (!values) {
    return null;
  }
  const names = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  names.sort();
  return names.length > 0 ? names : null;
};

const intersectNames = (left: string[], right: string[]) => {
  const rightNames = new Set(right);
  return left.filter((name) => rightNames.has(name));
};

const resolveSelectedAgent = (config?: AgentLoopConfig): AgentDefinition | null => {
  const agents = config?.agents ?? [];
  const selectedId = config?.agentSelection?.agentId;
  if (selectedId) {
    return agents.find((agent) => agent.id === selectedId) ?? null;
  }
  return agents.length === 1 ? (agents[0] ?? null) : null;
};

const resolveToolAllowlist = (
  config: AgentLoopConfig | undefined,
  selectedAgent: AgentDefinition | null,
) => {
  const configured = normalizeNameList(config?.tools?.allowlist);
  const selected =
    selectedAgent?.tools === undefined || selectedAgent.tools === null
      ? null
      : (normalizeNameList(selectedAgent.tools) ?? []);
  if (configured && selected) {
    return intersectNames(configured, selected);
  }
  return configured ?? selected;
};

export const resolveAgentExecutionProfile = (config?: AgentLoopConfig): AgentExecutionProfile => {
  const selectedAgent = resolveSelectedAgent(config);
  return {
    selectedAgent,
    toolAllowlist: resolveToolAllowlist(config, selectedAgent),
    toolDenylist: normalizeNameList(config?.tools?.denylist) ?? [],
  };
};

export const applyAgentPrompt = (
  profile: AgentExecutionProfile,
  context?: string,
): string | undefined => {
  const prompt = profile.selectedAgent?.prompt.trim();
  const callerContext = context?.trim();
  if (prompt && callerContext) {
    return `${prompt}\n\n${callerContext}`;
  }
  return prompt || callerContext || undefined;
};

export const filterAgentTools = (
  profile: AgentExecutionProfile,
  tools: Tool[] | null,
): Tool[] | null => {
  if (!tools) {
    return null;
  }
  const allowed = profile.toolAllowlist ? new Set(profile.toolAllowlist) : null;
  const denied = new Set(profile.toolDenylist);
  if (!allowed && denied.size === 0) {
    return tools;
  }
  return tools
    .filter((tool) => (!allowed || allowed.has(tool.name)) && !denied.has(tool.name))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const readMissingAgentTools = (
  profile: AgentExecutionProfile,
  tools: Tool[] | null,
): string[] => {
  if (!profile.toolAllowlist) {
    return [];
  }
  const available = new Set((tools ?? []).map((tool) => tool.name));
  return profile.toolAllowlist.filter((name) => !available.has(name));
};
