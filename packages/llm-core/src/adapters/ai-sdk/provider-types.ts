import type {
  ConversationId,
  InvocationContext,
  InvocationId,
  JsonValue,
  ToolCallId,
} from "#contracts";
import type { ModelRequest } from "../../features/model/public";
import type { ModelProfile } from "../../features/model/runtime";
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

/** Exact AI SDK operation owning a native fact. */
export type AiSdk7NativeOperation = "generateText" | "streamText";
export type AiSdk7NativeEventKind =
  | "approval"
  | "content"
  | "error"
  | "final-step"
  | "generate-result"
  | "generated-file"
  | "provider-metadata"
  | "response-metadata"
  | "source"
  | "step"
  | "structured-output"
  | "warning";

export interface AiSdk7NativeEvent {
  namespace: "dev.ai-sdk";
  authority: Readonly<{ ai: "7.0.37"; provider: "4.0.3" }>;
  operation: AiSdk7NativeOperation;
  kind: AiSdk7NativeEventKind;
  path: string;
  value: JsonValue;
}

export interface AiSdk7NativeContract {
  /** Return an explicitly safe projection, or reject the affected operation. */
  redact(event: Omit<AiSdk7NativeEvent, "namespace">): MaybePromise<JsonValue | undefined>;
  /** Persist or forward the safe native fact before portable projection continues. */
  observe(event: AiSdk7NativeEvent): MaybePromise<void>;
}

export interface CreateAiSdk7ModelInput {
  model: import("ai").LanguageModel;
  profile: ModelProfile;
  toolCallCorrelationStore: AiSdk7ToolCallCorrelationStore;
  resolveAbortSignal?: AiSdk7AbortSignalResolver;
  classifyToolApproval?: AiSdk7ToolApprovalPort;
  nativeContract: AiSdk7NativeContract;
  createToolCallId?: (providerToolCallId: string) => ToolCallId;
}
