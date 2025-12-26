import type {
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
} from "../types";
import { fromLlamaIndexMessage } from "./messages";
import { toAdapterTrace } from "../telemetry";
import { bindFirst, mapMaybe } from "../../maybe";
import { ModelUsageHelper } from "../modeling";
import { toLlamaIndexStreamEvents } from "./stream";
import type { LlamaIndexExecResult } from "./model-utils";
import {
  appendTelemetryResponse,
  createRunState,
  getExec,
  getStreamExec,
  parseOutput,
  readMessageText,
  toToolCalls,
  warn,
} from "./model-utils";

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
  const output = parseOutput(text, shouldParseOutput, result.object);
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

const toStreamResult = (
  stream: AsyncIterable<ChatResponseChunk>,
  toolCalls: LlamaToolCall[] | undefined,
  diagnostics: AdapterDiagnostic[],
) =>
  toLlamaIndexStreamEvents(stream, {
    toolCalls,
    diagnostics,
  });

const mapChatStreamResult = (
  state: ReturnType<typeof createRunState>,
  stream: AsyncIterable<ChatResponseChunk>,
) => toStreamResult(stream, undefined, state.diagnostics);

const mapExecStreamResult = (
  state: ReturnType<typeof createRunState>,
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

export function fromLlamaIndexModel(model: LLM): Model {
  function generate(call: ModelCall) {
    const state = createRunState(model, call);
    const exec = getExec(model);
    if (exec && ((state.tools && state.tools.length) || state.responseSchema)) {
      return mapMaybe(
        exec({
          messages: state.messages as ChatMessage[],
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
    const state = createRunState(model, call);
    if (state.hasResponseSchema) {
      return toStreamUnsupported(state.diagnostics);
    }
    const streamExec = getStreamExec(model);
    if (streamExec && state.tools && state.tools.length) {
      return mapMaybe(
        streamExec({
          messages: state.messages as ChatMessage[],
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
