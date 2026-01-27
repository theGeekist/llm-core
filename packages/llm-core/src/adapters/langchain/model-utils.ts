import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ToolMessage } from "@langchain/core/messages";
import type { ResponseFormatConfiguration } from "@langchain/openai";
import type {
  AdapterDiagnostic,
  ModelCall,
  ModelTelemetry,
  ModelUsage,
  ToolCall,
  ToolResult,
} from "../types";
import {
  buildMessages,
  mapToolCalls,
  mapToolResults,
  normalizeTimestamp,
  toResponseFormatSchema,
  tryParseJson,
} from "../utils";
import { ModelCallHelper } from "../modeling";
import { toLangChainMessage } from "./messages";
import { toLangChainTool } from "./tools";
import { readString } from "../utils";

export const toUsage = (usage: unknown): ModelUsage | null => {
  const typed = usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  if (
    typed?.input_tokens === undefined &&
    typed?.output_tokens === undefined &&
    typed?.total_tokens === undefined
  ) {
    return null;
  }
  return {
    inputTokens: typed.input_tokens ?? null,
    outputTokens: typed.output_tokens ?? null,
    totalTokens: typed.total_tokens ?? null,
  };
};

export const mapToolCall = (call: {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}): ToolCall => ({
  id: call.id,
  name: call.name,
  arguments: call.args ?? {},
});

export const toToolCalls = (
  calls: Array<{ id?: string; name: string; args: Record<string, unknown> }>,
) => mapToolCalls(calls, mapToolCall);

export const mapToolResult = (message: ToolMessage): ToolResult => ({
  toolCallId: message.tool_call_id,
  name: message.name ?? "tool",
  result: message.content,
  isError: message.status === "error",
});

export const toToolResults = (message: ToolMessage): ToolResult[] =>
  mapToolResults([message], mapToolResult);

export const toResponseFormat = (schema: Record<string, unknown>): ResponseFormatConfiguration =>
  toResponseFormatSchema(schema) as ResponseFormatConfiguration;

export const toToolChoice = (value: string | null) => {
  if (!value) {
    return null;
  }
  if (value === "auto" || value === "any" || value === "none") {
    return value;
  }
  if (value === "required") {
    return "any";
  }
  return value;
};

export const buildInvokeOptions = (
  toolChoice: string | null,
  responseFormat: ResponseFormatConfiguration | undefined,
) => {
  const options: Record<string, unknown> = {};
  if (toolChoice) {
    options.tool_choice = toolChoice;
  }
  if (responseFormat) {
    options.response_format = responseFormat;
  }
  return options;
};

export const readMetadataField = (meta: Record<string, unknown> | null, keys: string[]) => {
  if (!meta) {
    return null;
  }
  for (const key of keys) {
    const result = readString(meta[key]);
    if (result) {
      return result;
    }
  }
  return null;
};

export const toTelemetry = (
  response: Awaited<ReturnType<BaseChatModel["invoke"]>>,
  usage: ModelUsage | null,
  diagnostics: AdapterDiagnostic[],
): ModelTelemetry => {
  const responseMetadata = (response as { response_metadata?: Record<string, unknown> })
    .response_metadata;
  const created = responseMetadata?.created;
  const timestamp = typeof created === "number" ? normalizeTimestamp(created) : null;
  return {
    response: responseMetadata
      ? {
          id: readMetadataField(responseMetadata, ["id", "request_id"]),
          modelId: readMetadataField(responseMetadata, ["model", "model_name"]),
          timestamp,
        }
      : null,
    usage,
    warnings: diagnostics.filter((entry) => entry.message === "provider_warning"),
    providerMetadata: responseMetadata,
  };
};

export type RunState = {
  messages: Array<ReturnType<typeof toLangChainMessage>>;
  tools: ReturnType<typeof toLangChainTool>[] | undefined;
  toolChoice: string | null;
  responseFormat: ResponseFormatConfiguration | undefined;
  diagnostics: AdapterDiagnostic[];
};

export const createRunState = (call: ModelCall): RunState => {
  const prepared = ModelCallHelper.prepare(call);
  const tools = prepared.allowTools ? call.tools?.map(toLangChainTool) : undefined;
  const toolChoice = prepared.allowTools ? toToolChoice(call.toolChoice ?? null) : null;
  const responseFormat = prepared.normalizedSchema
    ? toResponseFormat(prepared.normalizedSchema.schema)
    : undefined;

  return {
    messages: buildMessages(
      {
        messages: prepared.messages,
        prompt: prepared.prompt,
        system: call.system,
      },
      toLangChainMessage,
    ),
    tools,
    toolChoice,
    responseFormat,
    diagnostics: prepared.diagnostics,
  };
};

export const tryParseOutput = (
  text: string,
  responseFormat: ResponseFormatConfiguration | undefined,
) => (responseFormat ? tryParseJson(text) : null);
