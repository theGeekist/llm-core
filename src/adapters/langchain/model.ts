import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessageChunk } from "@langchain/core/messages";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { AdapterDiagnostic, Model, ModelCall, ModelResult, ModelStreamEvent } from "../types";
import { fromLangChainMessage } from "./messages";
import type { RunState } from "./model-utils";
import {
  buildInvokeOptions,
  createRunState,
  toTelemetry,
  toToolCalls,
  toToolResults,
  toUsage,
  tryParseOutput,
} from "./model-utils";
import { toAdapterTrace } from "../telemetry";
import { bindFirst, maybeMap } from "../../maybe";
import { ModelUsageHelper } from "../modeling";
import { toLangChainStreamEvents } from "./stream";
import { warnDiagnostic } from "../utils";

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
  const output = tryParseOutput(text, state.responseFormat);
  if (state.responseFormat && output === undefined) {
    state.diagnostics.push(warnDiagnostic("response_schema_parse_failed"));
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

const toResultWithState = (
  state: RunState,
  response: Awaited<ReturnType<BaseChatModel["invoke"]>>,
) => toResult(response, state);

const streamModel = (
  model: BaseChatModel,
  state: RunState,
): Promise<Awaited<ReturnType<BaseChatModel["stream"]>>> => {
  const bindTools = model.bindTools?.bind(model);
  const runnable = state.tools?.length && bindTools ? bindTools(state.tools) : model;
  const invokeOptions = buildInvokeOptions(state.toolChoice, state.responseFormat);
  return (runnable as { stream: NonNullable<typeof model.stream> }).stream(
    state.messages,
    invokeOptions as Parameters<typeof model.stream>[1],
  );
};

const toStreamEvents = (state: RunState, stream: AsyncIterable<unknown>) =>
  toLangChainStreamEvents(stream as AsyncIterable<BaseMessageChunk>, {
    diagnostics: state.diagnostics,
  });

const mapStreamEvents = (state: RunState) => bindFirst(toStreamEvents, state);

const toStreamUnsupported = async function* (
  diagnostics: AdapterDiagnostic[],
): AsyncIterable<ModelStreamEvent> {
  yield {
    type: "error",
    error: new Error("streaming_unsupported_for_response_schema"),
    diagnostics,
  };
};

export function fromLangChainModel(model: BaseChatModel): Model {
  function generate(call: ModelCall) {
    const state = createRunState(call);
    return maybeMap(bindFirst(toResultWithState, state), invokeModel(model, state));
  }

  function stream(call: ModelCall) {
    const state = createRunState(call);
    if (state.responseFormat) {
      return toStreamUnsupported(state.diagnostics);
    }
    return maybeMap(mapStreamEvents(state), streamModel(model, state));
  }

  return { generate, stream };
}
