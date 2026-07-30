import type { ProviderMetadata } from "ai";
import type {
  ConversationId,
  InvocationContext,
  InvocationId,
  JsonValue,
  ToolCallId,
} from "#contracts";
import type { ModelRequest, RegisteredModelProfile } from "../../../features/model/public";
import type { MaybePromise } from "#shared/maybe";

export type AiSdk7ToolCallCorrelationScope =
  | { kind: "conversation"; conversationId: ConversationId }
  | { kind: "invocation"; invocationId: InvocationId };

export interface AiSdk7ToolCallCorrelation {
  providerToolCallId: string;
  coreToolCallId: ToolCallId;
  toolName: string;
}

/**
 * Durable correlation boundary for provider/core tool-call identities.
 *
 * Implementations must make `record` collision-safe across all scopes. Removal
 * defines the retention boundary after which historical turns fail closed.
 */
export interface AiSdk7ToolCallCorrelationStore {
  load(input: {
    scope: AiSdk7ToolCallCorrelationScope;
  }): MaybePromise<readonly AiSdk7ToolCallCorrelation[]>;
  record(input: {
    scope: AiSdk7ToolCallCorrelationScope;
    correlations: readonly AiSdk7ToolCallCorrelation[];
  }): MaybePromise<void>;
  delete(input: { scope: AiSdk7ToolCallCorrelationScope }): MaybePromise<void>;
}

export type AiSdk7ToolApprovalDecision = "denied" | "user-approval";

/**
 * Trusted composition hook for mapping the portable invocation lifecycle to a
 * live AbortSignal. The signal remains outside every portable request.
 */
export type AiSdk7AbortSignalResolver = (context: InvocationContext) => AbortSignal | undefined;

/**
 * Fail-closed provider approval classification.
 *
 * This hook can deny or request approval; it can never authorize execution.
 * AI SDK tool definitions created by this adapter intentionally have no
 * executor, so tool effects still flow through llm-core's control kernel.
 */
export type AiSdk7ToolApprovalPort = (input: {
  request: ModelRequest;
  context: InvocationContext;
  toolName: string;
  arguments: JsonValue;
}) => MaybePromise<AiSdk7ToolApprovalDecision>;

/**
 * Provider metadata is omitted unless trusted composition supplies a redactor
 * that returns an explicitly safe JSON projection.
 */
export type AiSdk7ProviderMetadataRedactor = (metadata: ProviderMetadata) => JsonValue | undefined;

export interface CreateAiSdk7ModelInput {
  model: import("ai").LanguageModel;
  profile: RegisteredModelProfile;
  toolCallCorrelationStore: AiSdk7ToolCallCorrelationStore;
  resolveAbortSignal?: AiSdk7AbortSignalResolver;
  classifyToolApproval?: AiSdk7ToolApprovalPort;
  redactProviderMetadata?: AiSdk7ProviderMetadataRedactor;
  createToolCallId?: (providerToolCallId: string) => ToolCallId;
}
