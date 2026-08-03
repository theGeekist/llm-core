import { newCoreId, type InvocationId, type JsonValue, type ToolCallId } from "#contracts";
import type { ModelProfile } from "../../../src/features/model/runtime";

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

export interface ModelAdapterOverrides {
  resolveAbortSignal?: () => AbortSignal;
  classifyToolApproval?: () => "denied" | "user-approval";
  redactProviderMetadata?: () => JsonValue | undefined;
  createToolCallId?: () => ToolCallId;
  profile?: ModelProfile;
}
