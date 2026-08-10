import { newCoreId, type InvocationId, type ToolCallId } from "#contracts";
import type { ModelProfile } from "../../../src/features/model/runtime";
import type { AiSdk7NativeContract } from "../../../src/adapters/ai-sdk";

export const TOOL_CALL_ID = newCoreId<ToolCallId>("0190bd0c-0000-7000-8000-000000000071");
export const INVOCATION_ID = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000000072");

export const asAsyncIterable = <T>(values: T[]): AsyncIterable<T> => ({
  async *[Symbol.asyncIterator]() {
    for (const value of values) yield value;
  },
});

export const usage = {
  inputTokens: 4,
  inputTokenDetails: { noCacheTokens: 2, cacheReadTokens: 2, cacheWriteTokens: 0 },
  outputTokens: 3,
  outputTokenDetails: { textTokens: 2, reasoningTokens: 1 },
  totalTokens: 7,
};

export const rejectUnexpectedEmbedding = () => {
  throw new Error("model tests do not invoke embedding");
};

export const completeGenerateTextResult = (value: Record<string, unknown>) => {
  const content = (value.content as unknown[] | undefined) ?? [];
  const response = {
    messages: [],
    id: "fixture-response",
    modelId: "fixture-model",
    timestamp: new Date(0),
    ...((value.response as Record<string, unknown> | undefined) ?? {}),
  };
  const step = {
    callId: "fixture-call",
    stepNumber: 0,
    model: { provider: "fixture-provider", modelId: "fixture-model" },
    runtimeContext: {},
    toolsContext: {},
    content,
    finishReason: value.finishReason ?? "stop",
    rawFinishReason: value.rawFinishReason,
    usage: value.usage ?? usage,
    performance: {
      effectiveOutputTokensPerSecond: 1,
      outputTokensPerSecond: undefined,
      inputTokensPerSecond: undefined,
      effectiveTotalTokensPerSecond: 1,
      stepTimeMs: 1,
      responseTimeMs: 1,
      toolExecutionMs: {},
      timeToFirstOutputMs: undefined,
    },
    warnings: value.warnings,
    request: value.request ?? {},
    response,
    providerMetadata: value.providerMetadata,
  };
  return {
    text: content
      .filter((part): part is { type: "text"; text: string } =>
        Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text"),
      )
      .map((part) => part.text)
      .join(""),
    reasoning: [],
    reasoningText: undefined,
    files: [],
    sources: [],
    toolCalls: [],
    staticToolCalls: [],
    dynamicToolCalls: [],
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    rawFinishReason: undefined,
    warnings: [],
    request: {},
    responseMessages: [],
    providerMetadata: undefined,
    steps: [step],
    finalStep: step,
    totalUsage: value.usage ?? usage,
    ...value,
    response,
  };
};

export interface ModelAdapterOverrides {
  resolveAbortSignal?: () => AbortSignal;
  classifyToolApproval?: () => "denied" | "user-approval";
  nativeContract?: AiSdk7NativeContract;
  createToolCallId?: () => ToolCallId;
  profile?: ModelProfile;
}
