import type {
  BaseTool,
  ChatMessage,
  ChatResponseChunk,
  LLM,
  ToolCall as LlamaToolCall,
} from "@llamaindex/core/llms";
import type { AdapterDiagnostic, ModelCall, ModelTelemetry, ModelUsage, ToolCall } from "../types";
import {
  buildMessages,
  mapToolCalls,
  normalizeTimestamp,
  readStructuredText,
  toResponseFormatSchema,
  tryParseJson,
} from "../utils";
import { ModelCallHelper } from "../modeling";
import { toLlamaIndexMessage } from "./messages";
import { toLlamaIndexTool } from "./tools";
import { readNumber, readString } from "../utils";

export type LlamaIndexExecResult = {
  newMessages: ChatMessage[];
  toolCalls: LlamaToolCall[];
  object?: unknown;
  raw?: unknown;
};

export type RunState = {
  messages: ChatMessage[];
  tools: BaseTool[] | undefined;
  responseSchema: unknown;
  diagnostics: AdapterDiagnostic[];
  telemetry: ModelTelemetry;
  modelId: string | undefined;
  hasResponseSchema: boolean;
};

export const mapToolCall = (call: LlamaToolCall): ToolCall => ({
  id: call.id,
  name: call.name,
  arguments: call.input,
});

export const toToolCalls = (calls: LlamaToolCall[]): ToolCall[] => mapToolCalls(calls, mapToolCall);

export const warn = (message: string, data?: unknown): AdapterDiagnostic => ({
  level: "warn",
  message,
  data,
});

export const toResponseTelemetry = (raw: unknown) => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const typed = raw as { id?: unknown; model?: unknown; created?: unknown };
  const id = readString(typed.id);
  const modelId = readString(typed.model);
  const created = readNumber(typed.created);
  const timestamp = created ? normalizeTimestamp(created) : null;
  if (!id && !modelId && timestamp === null) {
    return null;
  }
  return { id, modelId, timestamp };
};

export const readUsageValue = (value: unknown) => readNumber(value);

export const readUsagePayload = (raw: unknown) => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const usage = (raw as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }
  return usage as {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export const toUsage = (raw: unknown): ModelUsage | null => {
  const usage = readUsagePayload(raw);
  if (!usage) {
    return null;
  }
  const inputTokens = readUsageValue(usage.inputTokens ?? usage.input_tokens);
  const outputTokens = readUsageValue(usage.outputTokens ?? usage.output_tokens);
  const totalTokens = readUsageValue(usage.totalTokens ?? usage.total_tokens);
  if (inputTokens === null && outputTokens === null && totalTokens === null) {
    return null;
  }
  return {
    inputTokens: inputTokens ?? null,
    outputTokens: outputTokens ?? null,
    totalTokens: totalTokens ?? null,
  };
};

export const appendTelemetryResponse = (
  telemetry: ModelTelemetry | undefined,
  raw: unknown,
): ModelTelemetry | undefined => {
  const response = toResponseTelemetry(raw);
  const usage = toUsage(raw);
  if (!response && !usage) {
    return telemetry;
  }
  return {
    ...telemetry,
    response: response ?? telemetry?.response,
    usage: usage ?? telemetry?.usage,
  };
};

export const createRunState = (model: LLM, call: ModelCall): RunState => {
  const prepared = ModelCallHelper.prepare(call, { supportsToolChoice: false });
  const tools = prepared.allowTools ? call.tools?.map(toLlamaIndexTool) : undefined;
  const responseSchema = prepared.normalizedSchema
    ? toResponseFormatSchema(prepared.normalizedSchema.schema)
    : undefined;

  const modelId = typeof model.metadata?.model === "string" ? model.metadata.model : undefined;
  const telemetry: ModelTelemetry = {
    providerMetadata: model.metadata as Record<string, unknown> | undefined,
  };

  return {
    messages: buildMessages(
      {
        messages: prepared.messages,
        prompt: prepared.prompt,
        system: call.system,
      },
      toLlamaIndexMessage,
    ),
    tools,
    responseSchema,
    diagnostics: prepared.diagnostics,
    telemetry,
    modelId,
    hasResponseSchema: Boolean(call.responseSchema),
  };
};

export const getExec = (model: LLM) => {
  const exec = (
    model as {
      exec?: (options: {
        messages: ChatMessage[];
        tools?: BaseTool[];
        responseFormat?: unknown;
      }) => Promise<LlamaIndexExecResult>;
    }
  ).exec;
  return exec ? exec.bind(model) : null;
};

export const getStreamExec = (model: LLM) => {
  const exec = (
    model as {
      streamExec?: (options: {
        messages: ChatMessage[];
        tools?: BaseTool[];
        responseFormat?: unknown;
        stream: true;
      }) => Promise<{ stream: AsyncIterable<ChatResponseChunk>; toolCalls: LlamaToolCall[] }>;
    }
  ).streamExec;
  return exec ? exec.bind(model) : null;
};

export const readMessageText = (content: unknown) => readStructuredText(content);

export const parseOutput = (text: string, shouldParse: boolean, resultObject: unknown) =>
  resultObject ?? (shouldParse ? tryParseJson(text) : null);
