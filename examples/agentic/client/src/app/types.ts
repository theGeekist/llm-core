import type { WebSocketChatData } from "@geekist/llm-core/adapters/ai-sdk-ui";
import type { AgentSubagentOptions, AgentLoopConfig } from "@geekist/llm-core/interaction";
import type { SkillPresetId, ToolPresetId } from "../demo-options";

export type TransportData = WebSocketChatData & {
  agentConfig?: AgentLoopConfig;
  subagents?: AgentSubagentOptions;
  context?: string;
  threadId?: string;
};

export type OutcomeSummary = {
  status: string;
  token: string | null;
};

export type AgentConfigDraft = {
  profileId: string;
  toolPresetId: ToolPresetId;
  skillPresetId: SkillPresetId;
  agentId: string;
  agentName: string;
  agentDescription: string;
  agentPrompt: string;
  agentTools: string;
  toolAllowlist: string;
  toolDenylist: string;
  skillDirectories: string;
  skillDisabled: string;
  subagentsEnabled: boolean;
  subagentsMaxActive: string;
  subagentsIdPrefix: string;
  context: string;
  outputFormat: string;
  threadId: string;
};
