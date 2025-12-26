import type {
  BaseTool,
  ChatMessage,
  ChatResponseChunk,
  LLM,
  ToolCall as LlamaToolCall,
} from "@llamaindex/core/llms";
import type {
  AdapterDiagnostic,
  Model,
  ModelCall,
  ModelResult,
  ModelStreamEvent,
  ModelTelemetry,
  ModelUsage,
  ToolCall,
} from "../types";
import { fromLlamaIndexMessage, toLlamaIndexMessage } from "./messages";
import { toLlamaIndexTool } from "./tools";
import { toAdapterTrace } from "../telemetry";
import { bindFirst, mapMaybe } from "../../maybe";
import { ModelCallHelper, ModelUsageHelper } from "../modeling";
import { toLlamaIndexStreamEvents } from "./stream";

const toToolCalls = (calls: LlamaToolCall[]): ToolCall[] =>
  calls.map((call) => ({
    id: call.id,
    name: call.name,
    arguments: call.input,
  }));

const buildMessages = (input: {
  messages?: ModelCall["messages"];
  prompt?: ModelCall["prompt"];
  system?: ModelCall["system"];
}): ChatMessage[] => {
  const messages = input.messages?.map(toLlamaIndexMessage) ?? [];
  if (input.messages === undefined && input.prompt) {
    messages.push(toLlamaIndexMessage({ role: "user", content: input.prompt }));
  }
  if (input.system) {
    messages.unshift(toLlamaIndexMessage({ role: "system", content: input.system }));
  }
  return messages;
};

type LlamaIndexExecResult = {
  newMessages: ChatMessage[];
  toolCalls: LlamaToolCall[];
  object?: unknown;
  raw?: unknown;
};

const readMessageText = (content: unknown) => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (typeof entry === "object" && entry && "text" in entry) {
          const text = (entry as { text?: string }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
};

const toResponseFormat = (schema: Record<string, unknown>) => ({
  type: "json_schema",
  json_schema: {
    name: "response",
    schema,
  },
});

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
const readNumber = (value: unknown) => (typeof value === "number" ? value : undefined);

const normalizeTimestamp = (value: number) => (value < 1_000_000_000_000 ? value * 1000 : value);

const toResponseTelemetry = (raw: unknown) => {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const typed = raw as { id?: unknown; model?: unknown; created?: unknown };
  const id = readString(typed.id);
  const modelId = readString(typed.model);
  const created = readNumber(typed.created);
  const timestamp = created === undefined ? undefined : normalizeTimestamp(created);
  if (!id && !modelId && timestamp === undefined) {
    return undefined;
  }
  return { id, modelId, timestamp };
};

const readUsageValue = (value: unknown) => (typeof value === "number" ? value : undefined);

const toUsage = (raw: unknown): ModelUsage | undefined => {
  const usage = readUsagePayload(raw);
  if (!usage) {
    return undefined;
  }
  const inputTokens = readUsageValue(usage.inputTokens ?? usage.input_tokens);
  const outputTokens = readUsageValue(usage.outputTokens ?? usage.output_tokens);
  const totalTokens = readUsageValue(usage.totalTokens ?? usage.total_tokens);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }
  return { inputTokens, outputTokens, totalTokens };
};

const readUsagePayload = (raw: unknown) => {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const usage = (raw as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
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

const appendTelemetryResponse = (
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

const getExec = (model: LLM) => {
  const exec = (
    model as {
      exec?: (options: {
        messages: ChatMessage[];
        tools?: BaseTool[];
        responseFormat?: unknown;
      }) => Promise<LlamaIndexExecResult>;
    }
  ).exec;
  return exec ? exec.bind(model) : undefined;
};

const getStreamExec = (model: LLM) => {
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
  return exec ? exec.bind(model) : undefined;
};

const toExecResult = (
  result: LlamaIndexExecResult,
  diagnostics: AdapterDiagnostic[],
  telemetry: ModelTelemetry | undefined,
  modelId: string | undefined,
  shouldParseOutput: boolean,
): ModelResult => {
  const newMessages = result.newMessages.map(fromLlamaIndexMessage);
  const lastMessage = newMessages.at(-1);
  const text = lastMessage
    ? typeof lastMessage.content === "string"
      ? lastMessage.content
      : lastMessage.content.text
    : "";
  const output = result.object ?? (shouldParseOutput ? tryParseJson(text) : undefined);
  if (shouldParseOutput && output === undefined) {
    diagnostics.push(warn("response_schema_parse_failed"));
  }
  const nextTelemetry = appendTelemetryResponse(telemetry, result.raw);
  ModelUsageHelper.warnIfMissing(diagnostics, nextTelemetry?.usage, "llamaindex");
  return {
    text,
    messages: newMessages,
    toolCalls: toToolCalls(result.toolCalls),
    output,
    diagnostics,
    telemetry: nextTelemetry,
    trace: toAdapterTrace(nextTelemetry),
    usage: nextTelemetry?.usage,
    meta: { provider: "llamaindex", modelId },
    raw: result,
  };
};

const toChatResult = (
  response: Awaited<ReturnType<LLM["chat"]>>,
  diagnostics: AdapterDiagnostic[],
  telemetry: ModelTelemetry | undefined,
  modelId: string | undefined,
): ModelResult => {
  const Message = fromLlamaIndexMessage(response.message);
  const nextTelemetry = appendTelemetryResponse(telemetry, response.raw);
  ModelUsageHelper.warnIfMissing(diagnostics, nextTelemetry?.usage, "llamaindex");
  return {
    text: readMessageText(response.message.content),
    messages: [Message],
    diagnostics,
    telemetry: nextTelemetry,
    trace: toAdapterTrace(nextTelemetry),
    usage: nextTelemetry?.usage,
    meta: { provider: "llamaindex", modelId },
    raw: response,
  };
};

export function fromLlamaIndexModel(model: LLM): Model {
  type RunState = {
    messages: ChatMessage[];
    tools: BaseTool[] | undefined;
    responseSchema: unknown;
    diagnostics: AdapterDiagnostic[];
    telemetry: ModelTelemetry;
    modelId: string | undefined;
    hasResponseSchema: boolean;
  };

  const createRunState = (call: ModelCall): RunState => {
    const prepared = ModelCallHelper.prepare(call, { supportsToolChoice: false });
    const tools = prepared.allowTools ? call.tools?.map(toLlamaIndexTool) : undefined;
    const responseSchema = prepared.normalizedSchema
      ? toResponseFormat(prepared.normalizedSchema.schema)
      : undefined;

    const modelId = typeof model.metadata?.model === "string" ? model.metadata.model : undefined;
    const telemetry: ModelTelemetry = {
      providerMetadata: model.metadata as Record<string, unknown> | undefined,
    };

    return {
      messages: buildMessages({
        messages: prepared.messages,
        prompt: prepared.prompt,
        system: call.system,
      }),
      tools,
      responseSchema,
      diagnostics: prepared.diagnostics,
      telemetry,
      modelId,
      hasResponseSchema: Boolean(call.responseSchema),
    };
  };

  const toStreamResult = (
    stream: AsyncIterable<ChatResponseChunk>,
    toolCalls: LlamaToolCall[] | undefined,
    diagnostics: AdapterDiagnostic[],
  ) =>
    toLlamaIndexStreamEvents(stream, {
      toolCalls,
      diagnostics,
    });

  const mapChatStreamResult = (state: RunState, stream: AsyncIterable<ChatResponseChunk>) =>
    toStreamResult(stream, undefined, state.diagnostics);

  const mapExecStreamResult = (
    state: RunState,
    result: { stream: AsyncIterable<ChatResponseChunk>; toolCalls: LlamaToolCall[] },
  ) => toStreamResult(result.stream, result.toolCalls, state.diagnostics);

  const toStreamUnsupported = async function* (
    diagnostics: AdapterDiagnostic[],
  ): AsyncIterable<ModelStreamEvent> {
    yield {
      type: "error",
      error: new Error("streaming_unsupported_for_response_schema"),
      diagnostics,
    };
  };

  function generate(call: ModelCall) {
    const state = createRunState(call);
    const exec = getExec(model);
    if (exec && ((state.tools && state.tools.length) || state.responseSchema)) {
      return mapMaybe(
        exec({
          messages: state.messages,
          tools: state.tools,
          responseFormat: state.responseSchema,
        }),
        (result) =>
          toExecResult(
            result,
            state.diagnostics,
            state.telemetry,
            state.modelId,
            state.hasResponseSchema,
          ),
      );
    }

    return mapMaybe(model.chat({ messages: state.messages }), (response) =>
      toChatResult(response, state.diagnostics, state.telemetry, state.modelId),
    );
  }

  function stream(call: ModelCall) {
    const state = createRunState(call);
    if (state.hasResponseSchema) {
      return toStreamUnsupported(state.diagnostics);
    }
    const streamExec = getStreamExec(model);
    if (streamExec && state.tools && state.tools.length) {
      return mapMaybe(
        streamExec({
          messages: state.messages,
          tools: state.tools,
          responseFormat: state.responseSchema,
          stream: true,
        }),
        bindFirst(mapExecStreamResult, state),
      );
    }
    return mapMaybe(
      model.chat({ messages: state.messages, stream: true }),
      bindFirst(mapChatStreamResult, state),
    );
  }

  return { generate, stream };
}
