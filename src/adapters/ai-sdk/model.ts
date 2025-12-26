import {
  generateObject,
  generateText,
  jsonSchema,
  streamText,
  zodSchema,
  type LanguageModel,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import type {
  AdapterDiagnostic,
  Model,
  ModelCall,
  ModelResult,
  ModelTelemetry,
  ModelStreamEvent,
  ModelUsage,
  Schema,
  ToolCall,
  ToolResult,
} from "../types";
import { fromAiSdkMessage, toAiSdkMessage } from "./messages";
import { toAiSdkTools } from "./tools";
import { toAdapterTrace } from "../telemetry";
import { mapMaybe } from "../../maybe";
import { ModelCallHelper, ModelUsageHelper } from "../modeling";
import { validateModelCall } from "../model-validation";
import { toModelStreamEvents, toStreamErrorEvents } from "./stream";

const toModelUsage = (usage?: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): ModelUsage | undefined => {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
};

const toToolCalls = (
  calls: Array<{ toolCallId: string; toolName: string; input: unknown }> | undefined,
): ToolCall[] =>
  (calls ?? []).map((call) => ({
    id: call.toolCallId,
    name: call.toolName,
    arguments: (call.input ?? {}) as Record<string, unknown>,
  }));

const toToolResults = (
  results: Array<{ toolCallId: string; toolName: string; output: unknown }> | undefined,
): ToolResult[] =>
  (results ?? []).map((result) => ({
    toolCallId: result.toolCallId,
    name: result.toolName,
    result: result.output,
  }));

type AiJsonSchemaInput = Parameters<typeof jsonSchema>[0];
type AiZodSchemaInput = Parameters<typeof zodSchema>[0];

type NormalizedSchema = ReturnType<typeof validateModelCall>["normalizedSchema"];

const toAiSdkSchema = (schema: Schema, normalizedSchema: NormalizedSchema) => {
  if (schema.kind === "zod" && normalizedSchema?.isObject) {
    return zodSchema(schema.jsonSchema as AiZodSchemaInput);
  }
  return jsonSchema((normalizedSchema?.schema ?? schema.jsonSchema) as AiJsonSchemaInput);
};

const buildPromptOptions = (prepared: {
  messages?: ModelCall["messages"];
  prompt?: ModelCall["prompt"];
}) => {
  if (prepared.messages !== undefined) {
    return { messages: prepared.messages.map(toAiSdkMessage) };
  }
  return { prompt: prepared.prompt ?? "" };
};

const toToolChoice = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  if (value === "auto" || value === "required" || value === "none") {
    return value;
  }
  return { type: "tool" as const, toolName: value };
};

const warn = (message: string, data?: unknown): AdapterDiagnostic => ({
  level: "warn",
  message,
  data,
});

const toDiagnostics = (warnings?: unknown[]): AdapterDiagnostic[] =>
  warnings?.map((warning) => warn("provider_warning", warning)) ?? [];

const toTelemetry = (result: {
  request?: { body?: unknown };
  response?: {
    id?: string;
    modelId?: string;
    timestamp?: Date;
    headers?: Record<string, string>;
    body?: unknown;
  };
  usage?: ModelUsage;
  totalUsage?: ModelUsage;
  warnings?: unknown[];
  providerMetadata?: Record<string, unknown>;
}): ModelTelemetry => ({
  request: result.request ? { body: result.request.body } : undefined,
  response: result.response
    ? {
        id: result.response.id,
        modelId: result.response.modelId,
        timestamp: result.response.timestamp?.getTime(),
        headers: result.response.headers,
        body: result.response.body,
      }
    : undefined,
  usage: result.usage,
  totalUsage: result.totalUsage,
  warnings: toDiagnostics(result.warnings),
  providerMetadata: result.providerMetadata,
});

export function fromAiSdkModel(model: LanguageModel): Model {
  type RunState = {
    promptOptions: ReturnType<typeof buildPromptOptions>;
    tools: ReturnType<typeof toAiSdkTools> | undefined;
    toolChoice: ReturnType<typeof toToolChoice> | undefined;
    diagnostics: AdapterDiagnostic[];
    normalizedSchema: NormalizedSchema;
  };

  const createRunState = (call: ModelCall): RunState => {
    const prepared = ModelCallHelper.prepare(call);
    const tools = prepared.allowTools ? toAiSdkTools(call.tools) : undefined;
    const toolChoice = prepared.allowTools ? toToolChoice(call.toolChoice) : undefined;

    return {
      promptOptions: buildPromptOptions(prepared),
      tools,
      toolChoice,
      diagnostics: prepared.diagnostics,
      normalizedSchema: prepared.normalizedSchema,
    };
  };

  const toMeta = (response?: { modelId?: string; id?: string }) => ({
    provider: "ai-sdk",
    modelId: response?.modelId,
    requestId: response?.id,
  });

  const toSchemaResult = (
    result: Awaited<ReturnType<typeof generateObject>>,
    state: RunState,
  ): ModelResult => {
    const usage = toModelUsage(result.usage);
    const diagnostics = state.diagnostics.concat(toDiagnostics(result.warnings));
    ModelUsageHelper.warnIfMissing(diagnostics, usage, "ai-sdk");
    const telemetry = toTelemetry({
      request: result.request,
      response: result.response,
      usage,
      warnings: result.warnings,
      providerMetadata: result.providerMetadata as Record<string, unknown> | undefined,
    });
    return {
      text: typeof result.object === "string" ? result.object : JSON.stringify(result.object),
      output: result.object,
      reasoning: result.reasoning,
      diagnostics,
      telemetry,
      trace: toAdapterTrace(telemetry),
      usage,
      meta: toMeta(result.response),
      raw: result,
    };
  };

  const toTextResult = (
    result: Awaited<ReturnType<typeof generateText>>,
    state: RunState,
  ): ModelResult => {
    const usage = toModelUsage(result.usage);
    const totalUsage = toModelUsage(result.totalUsage);
    const collapsedUsage = totalUsage ?? usage;
    const diagnostics = state.diagnostics.concat(toDiagnostics(result.warnings));
    ModelUsageHelper.warnIfMissing(diagnostics, collapsedUsage, "ai-sdk");
    const telemetry = toTelemetry({
      request: result.request,
      response: result.response,
      usage,
      totalUsage,
      warnings: result.warnings,
      providerMetadata: result.providerMetadata as Record<string, unknown> | undefined,
    });
    return {
      text: result.text,
      messages: result.response?.messages?.map(fromAiSdkMessage),
      toolCalls: toToolCalls(result.toolCalls),
      toolResults: toToolResults(result.toolResults),
      reasoning: result.reasoningText ?? result.reasoning,
      diagnostics,
      telemetry,
      trace: toAdapterTrace(telemetry),
      usage: collapsedUsage,
      meta: toMeta(result.response),
      raw: result,
    };
  };

  const toUsageEvent = (usage?: ModelUsage): ModelStreamEvent | undefined => {
    if (!usage) {
      return undefined;
    }
    return { type: "usage", usage };
  };

  const toEndEvent = (
    finishReason: string | undefined,
    diagnostics: AdapterDiagnostic[],
  ): ModelStreamEvent => ({
    type: "end",
    finishReason,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
  });

  const toStreamEvents = async function* (
    result: StreamTextResult<ToolSet, unknown>,
    state: RunState,
  ): AsyncIterable<ModelStreamEvent> {
    // Note: Abort vs resume semantics should be documented for transport resume bridges.
    for await (const event of toModelStreamEvents(result.fullStream)) {
      yield event;
    }

    const usage = toModelUsage(await result.totalUsage);
    ModelUsageHelper.warnIfMissing(state.diagnostics, usage, "ai-sdk");
    const usageEvent = toUsageEvent(usage);
    if (usageEvent) {
      yield usageEvent;
    }

    const finishReason = await result.finishReason;
    yield toEndEvent(finishReason, state.diagnostics);
  };

  const toStreamUnsupported = async function* (state: RunState): AsyncIterable<ModelStreamEvent> {
    yield* toStreamErrorEvents(
      new Error("streaming_unsupported_for_response_schema"),
      state.diagnostics,
    );
  };

  function generate(call: ModelCall) {
    const state = createRunState(call);
    if (call.responseSchema) {
      return mapMaybe(
        generateObject({
          model,
          system: call.system,
          ...state.promptOptions,
          schema: toAiSdkSchema(call.responseSchema, state.normalizedSchema),
          temperature: call.temperature,
          topP: call.topP,
          maxOutputTokens: call.maxTokens,
        }),
        (result) => toSchemaResult(result, state),
      );
    }

    return mapMaybe(
      generateText({
        model,
        system: call.system,
        ...state.promptOptions,
        tools: state.tools,
        toolChoice: state.toolChoice,
        temperature: call.temperature,
        topP: call.topP,
        maxOutputTokens: call.maxTokens,
      }),
      (result) => toTextResult(result, state),
    );
  }

  function stream(call: ModelCall) {
    const state = createRunState(call);
    if (call.responseSchema) {
      return toStreamUnsupported(state);
    }

    return mapMaybe(
      streamText({
        model,
        system: call.system,
        ...state.promptOptions,
        tools: state.tools,
        toolChoice: state.toolChoice,
        temperature: call.temperature,
        topP: call.topP,
        maxOutputTokens: call.maxTokens,
      }),
      (result) => toStreamEvents(result, state),
    );
  }

  return { generate, stream };
}
