import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { ResponseFormatConfiguration } from "@langchain/openai";
import type {
  AdapterDiagnostic,
  Model,
  ModelCall,
  ModelResult,
  ModelTelemetry,
  ModelUsage,
  ToolCall,
  ToolResult,
} from "../types";
import { fromLangChainMessage, toLangChainMessage } from "./messages";
import { toLangChainTool } from "./tools";
import { toAdapterTrace } from "../telemetry";
import { mapMaybe } from "../../maybe";
import { ModelCallHelper, ModelUsageHelper } from "../modeling";

const toUsage = (usage: unknown): ModelUsage | undefined => {
  const typed = usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  if (
    typed?.input_tokens === undefined &&
    typed?.output_tokens === undefined &&
    typed?.total_tokens === undefined
  ) {
    return undefined;
  }
  return {
    inputTokens: typed.input_tokens,
    outputTokens: typed.output_tokens,
    totalTokens: typed.total_tokens,
  };
};

const toToolCalls = (calls: Array<{ id?: string; name: string; args: Record<string, unknown> }>) =>
  calls.map(
    (call): ToolCall => ({
      id: call.id,
      name: call.name,
      arguments: call.args ?? {},
    }),
  );

const toToolResults = (message: ToolMessage): ToolResult[] => [
  {
    toolCallId: message.tool_call_id,
    name: message.name ?? "tool",
    result: message.content,
    isError: message.status === "error",
  },
];

const toResponseFormat = (schema: Record<string, unknown>): ResponseFormatConfiguration => ({
  type: "json_schema",
  json_schema: {
    name: "response",
    schema,
  },
});

const buildMessages = (input: {
  messages?: ModelCall["messages"];
  prompt?: ModelCall["prompt"];
  system?: ModelCall["system"];
}) => {
  const messages = input.messages?.map(toLangChainMessage) ?? [];
  if (input.messages === undefined && input.prompt) {
    messages.push(toLangChainMessage({ role: "user", content: input.prompt }));
  }
  if (input.system) {
    messages.unshift(toLangChainMessage({ role: "system", content: input.system }));
  }
  return messages;
};

const toToolChoice = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  if (value === "auto" || value === "any" || value === "none") {
    return value;
  }
  if (value === "required") {
    return "any";
  }
  return value;
};

const buildInvokeOptions = (
  toolChoice: string | undefined,
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

const warn = (message: string, data?: unknown): AdapterDiagnostic => ({
  level: "warn",
  message,
  data,
});

const tryParseJson = (value: string) => {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const readString = (value: unknown) => (typeof value === "string" ? value : undefined);

const readMetadataField = (meta: Record<string, unknown> | undefined, keys: string[]) => {
  if (!meta) {
    return undefined;
  }
  for (const key of keys) {
    const result = readString(meta[key]);
    if (result) {
      return result;
    }
  }
  return undefined;
};

const toTelemetry = (
  response: Awaited<ReturnType<BaseChatModel["invoke"]>>,
  usage: ModelUsage | undefined,
  diagnostics: AdapterDiagnostic[],
): ModelTelemetry => {
  const responseMetadata = (response as { response_metadata?: Record<string, unknown> })
    .response_metadata;
  const created = responseMetadata?.created;
  const timestamp =
    typeof created === "number"
      ? created < 1_000_000_000_000
        ? created * 1000
        : created
      : undefined;
  return {
    response: responseMetadata
      ? {
          id: readMetadataField(responseMetadata, ["id", "request_id"]),
          modelId: readMetadataField(responseMetadata, ["model", "model_name"]),
          timestamp,
        }
      : undefined,
    usage,
    warnings: diagnostics.filter((entry) => entry.message === "provider_warning"),
    providerMetadata: responseMetadata,
  };
};

type RunState = {
  messages: ReturnType<typeof buildMessages>;
  tools: ReturnType<typeof toLangChainTool>[] | undefined;
  toolChoice: string | undefined;
  responseFormat: ResponseFormatConfiguration | undefined;
  diagnostics: AdapterDiagnostic[];
};

const createRunState = (call: ModelCall): RunState => {
  const prepared = ModelCallHelper.prepare(call);
  const tools = prepared.allowTools ? call.tools?.map(toLangChainTool) : undefined;
  const toolChoice = prepared.allowTools ? toToolChoice(call.toolChoice) : undefined;
  const responseFormat = prepared.normalizedSchema
    ? toResponseFormat(prepared.normalizedSchema.schema)
    : undefined;

  return {
    messages: buildMessages({
      messages: prepared.messages,
      prompt: prepared.prompt,
      system: call.system,
    }),
    tools,
    toolChoice,
    responseFormat,
    diagnostics: prepared.diagnostics,
  };
};

const invokeModel = (
  model: BaseChatModel,
  state: RunState,
): Promise<Awaited<ReturnType<BaseChatModel["invoke"]>>> => {
  const bindTools = model.bindTools?.bind(model);
  const runnable = state.tools?.length && bindTools ? bindTools(state.tools) : model;
  const invokeOptions = buildInvokeOptions(state.toolChoice, state.responseFormat);
  return (runnable as { invoke: NonNullable<typeof model.invoke> }).invoke(
    state.messages,
    invokeOptions as Parameters<typeof model.invoke>[1],
  );
};

const extractToolCalls = (response: unknown) =>
  AIMessage.isInstance(response) && response.tool_calls ? toToolCalls(response.tool_calls) : [];

const extractToolResults = (response: unknown) =>
  ToolMessage.isInstance(response) ? toToolResults(response) : [];

const toResult = (
  response: Awaited<ReturnType<BaseChatModel["invoke"]>>,
  state: RunState,
): ModelResult => {
  const Message = fromLangChainMessage(response);
  const text = typeof Message.content === "string" ? Message.content : Message.content.text;
  const output = state.responseFormat ? tryParseJson(text) : undefined;
  if (state.responseFormat && output === undefined) {
    state.diagnostics.push(warn("response_schema_parse_failed"));
  }
  const usage = toUsage((response as { usage_metadata?: unknown }).usage_metadata);
  ModelUsageHelper.warnIfMissing(state.diagnostics, usage, "langchain");
  const telemetry = toTelemetry(response, usage, state.diagnostics);

  return {
    text,
    messages: [Message],
    toolCalls: extractToolCalls(response),
    toolResults: extractToolResults(response),
    output,
    diagnostics: state.diagnostics,
    telemetry,
    trace: toAdapterTrace(telemetry),
    usage,
    meta: {
      provider: "langchain",
      modelId: telemetry.response?.modelId,
      requestId: telemetry.response?.id,
    },
    raw: response,
  };
};

export function fromLangChainModel(model: BaseChatModel): Model {
  function generate(call: ModelCall) {
    const state = createRunState(call);
    return mapMaybe(invokeModel(model, state), (response) => toResult(response, state));
  }

  return { generate };
}
