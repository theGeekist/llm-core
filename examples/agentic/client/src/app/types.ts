import type { WebSocketChatData } from "@geekist/llm-core/adapters/ai-sdk-ui";
import type {
  AgentApprovalPolicy,
  AgentSubagentOptions,
  AgentLoopConfig,
} from "@geekist/llm-core/interaction";
import type { McpPresetId, SkillPresetId, ToolPresetId } from "../demo-options";

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

export type JsonParseResult = {
  value: Record<string, unknown> | null;
  error: string | null;
};

export type AgentConfigDraft = {
  profileId: string;
  toolPresetId: ToolPresetId;
  skillPresetId: SkillPresetId;
  mcpPresetId: McpPresetId;
  agentId: string;
  agentName: string;
  agentDescription: string;
  agentPrompt: string;
  agentTools: string;
  toolAllowlist: string;
  toolDenylist: string;
  skillDirectories: string;
  skillDisabled: string;
  mcpServersJson: string;
  approvalsPolicy: AgentApprovalPolicy;
  approvalsCache: string;
  subagentsEnabled: boolean;
  subagentsMaxActive: string;
  subagentsIdPrefix: string;
  context: string;
  outputFormat: string;
  threadId: string;
};
