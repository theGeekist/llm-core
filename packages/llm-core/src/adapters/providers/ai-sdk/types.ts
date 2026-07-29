import type { ProviderMetadata } from "ai";
import type { InvocationContext, JsonValue, ToolCallId } from "#contracts";
import type {
  ModelRequest,
  RegisteredModelProfile,
} from "../../../features/model/public";
import type { MaybePromise } from "#shared/maybe";

export type AiSdk7ToolApprovalDecision = "denied" | "user-approval";

/**
 * Trusted composition hook for mapping the portable invocation lifecycle to a
 * live AbortSignal. The signal remains outside every portable request.
 */
export type AiSdk7AbortSignalResolver = (
  context: InvocationContext,
) => AbortSignal | undefined;

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
export type AiSdk7ProviderMetadataRedactor = (
  metadata: ProviderMetadata,
) => JsonValue | undefined;

export interface CreateAiSdk7ModelInput {
  model: import("ai").LanguageModel;
  profile: RegisteredModelProfile;
  resolveAbortSignal?: AiSdk7AbortSignalResolver;
  classifyToolApproval?: AiSdk7ToolApprovalPort;
  redactProviderMetadata?: AiSdk7ProviderMetadataRedactor;
  createToolCallId?: (providerToolCallId: string) => ToolCallId;
}
