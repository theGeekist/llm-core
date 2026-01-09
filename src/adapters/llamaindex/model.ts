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
import { bindFirst } from "../../shared/fp";
import { maybeMap } from "../../shared/maybe";
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
} from "./model-utils";
import { warnDiagnostic } from "../utils";
import { readRetryPolicyFromCandidates } from "../retry-metadata";

const readLlamaIndexRetryPolicy = (model: LLM) => readRetryPolicyFromCandidates([model]);

type ExecResultInput = {
  result: LlamaIndexExecResult;
  diagnostics: AdapterDiagnostic[];
  telemetry: ModelTelemetry | undefined;
  modelId: string | undefined;
  shouldParseOutput: boolean;
};

const toExecResult = (input: ExecResultInput): ModelResult => {
  const newMessages = input.result.newMessages.map(fromLlamaIndexMessage);
  const lastMessage = newMessages.at(-1);
  const text = lastMessage
    ? typeof lastMessage.content === "string"
      ? lastMessage.content
      : lastMessage.content.text
    : "";
  const output = parseOutput(text, input.shouldParseOutput, input.result.object);
  if (input.shouldParseOutput && output === null) {
    input.diagnostics.push(warnDiagnostic("response_schema_parse_failed"));
  }
  const nextTelemetry = appendTelemetryResponse(input.telemetry, input.result.raw);
  ModelUsageHelper.warnIfMissing(input.diagnostics, nextTelemetry?.usage, "llamaindex");
  return {
    text,
    messages: newMessages,
    toolCalls: toToolCalls(input.result.toolCalls),
    output,
    diagnostics: input.diagnostics,
    telemetry: nextTelemetry,
    trace: toAdapterTrace(nextTelemetry),
    usage: nextTelemetry?.usage,
    meta: { provider: "llamaindex", modelId: input.modelId },
    raw: input.result,
  };
};

type ChatResultInput = {
  response: Awaited<ReturnType<LLM["chat"]>>;
  diagnostics: AdapterDiagnostic[];
  telemetry: ModelTelemetry | undefined;
  modelId: string | undefined;
};

const toChatResult = (input: ChatResultInput): ModelResult => {
  const Message = fromLlamaIndexMessage(input.response.message);
  const nextTelemetry = appendTelemetryResponse(input.telemetry, input.response.raw);
  ModelUsageHelper.warnIfMissing(input.diagnostics, nextTelemetry?.usage, "llamaindex");
  return {
    text: readMessageText(input.response.message.content),
    messages: [Message],
    diagnostics: input.diagnostics,
    telemetry: nextTelemetry,
    trace: toAdapterTrace(nextTelemetry),
    usage: nextTelemetry?.usage,
    meta: { provider: "llamaindex", modelId: input.modelId },
    raw: input.response,
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

type RunState = ReturnType<typeof createRunState>;

const mapExecResult = (state: RunState, result: LlamaIndexExecResult) =>
  toExecResult({
    result,
    diagnostics: state.diagnostics,
    telemetry: state.telemetry,
    modelId: state.modelId,
    shouldParseOutput: state.hasResponseSchema,
  });

const mapChatResult = (state: RunState, response: Awaited<ReturnType<LLM["chat"]>>) =>
  toChatResult({
    response,
    diagnostics: state.diagnostics,
    telemetry: state.telemetry,
    modelId: state.modelId,
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
      return maybeMap(
        bindFirst(mapExecResult, state),
        exec({
          messages: state.messages as ChatMessage[],
          tools: state.tools,
          responseFormat: state.responseSchema,
        }),
      );
    }

    return maybeMap(bindFirst(mapChatResult, state), model.chat({ messages: state.messages }));
  }

  function stream(call: ModelCall) {
    const state = createRunState(model, call);
    if (state.hasResponseSchema) {
      return toStreamUnsupported(state.diagnostics);
    }
    const streamExec = getStreamExec(model);
    if (streamExec && state.tools && state.tools.length) {
      return maybeMap(
        bindFirst(mapExecStreamResult, state),
        streamExec({
          messages: state.messages as ChatMessage[],
          tools: state.tools,
          responseFormat: state.responseSchema,
          stream: true,
        }),
      );
    }
    return maybeMap(
      bindFirst(mapChatStreamResult, state),
      model.chat({ messages: state.messages, stream: true }),
    );
  }

  const retryPolicy = readLlamaIndexRetryPolicy(model);
  return {
    generate,
    stream,
    metadata: retryPolicy ? { retry: { policy: retryPolicy } } : undefined,
  };
}
