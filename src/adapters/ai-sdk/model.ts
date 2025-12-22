import { generateObject, generateText, jsonSchema, zodSchema, type LanguageModel } from "ai";
import type {
  AdapterDiagnostic,
  AdapterModel,
  AdapterModelCall,
  AdapterModelResult,
  AdapterModelTelemetry,
  AdapterModelUsage,
  AdapterSchema,
  AdapterToolCall,
  AdapterToolResult,
} from "../types";
import { fromAiSdkMessage, toAiSdkMessage } from "./messages";
import { toAiSdkTools } from "./tools";
import { toAdapterTrace } from "../telemetry";
import { mapMaybe } from "../../maybe";
import { ModelCall, ModelUsage } from "../modeling";
import { validateModelCall } from "../model-validation";

const toModelUsage = (usage?: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): AdapterModelUsage | undefined => {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
};

const toAdapterToolCalls = (
  calls: Array<{ toolCallId: string; toolName: string; input: unknown }> | undefined,
): AdapterToolCall[] =>
  (calls ?? []).map((call) => ({
    id: call.toolCallId,
    name: call.toolName,
    arguments: (call.input ?? {}) as Record<string, unknown>,
  }));

const toAdapterToolResults = (
  results: Array<{ toolCallId: string; toolName: string; output: unknown }> | undefined,
): AdapterToolResult[] =>
  (results ?? []).map((result) => ({
    toolCallId: result.toolCallId,
    name: result.toolName,
    result: result.output,
  }));

type AiJsonSchemaInput = Parameters<typeof jsonSchema>[0];
type AiZodSchemaInput = Parameters<typeof zodSchema>[0];

type NormalizedSchema = ReturnType<typeof validateModelCall>["normalizedSchema"];

const toAiSdkSchema = (schema: AdapterSchema, normalizedSchema: NormalizedSchema) => {
  if (schema.kind === "zod" && normalizedSchema?.isObject) {
    return zodSchema(schema.jsonSchema as AiZodSchemaInput);
  }
  return jsonSchema((normalizedSchema?.schema ?? schema.jsonSchema) as AiJsonSchemaInput);
};

const buildPromptOptions = (prepared: {
  messages?: AdapterModelCall["messages"];
  prompt?: AdapterModelCall["prompt"];
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
  usage?: AdapterModelUsage;
  totalUsage?: AdapterModelUsage;
  warnings?: unknown[];
  providerMetadata?: Record<string, unknown>;
}): AdapterModelTelemetry => ({
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

export function fromAiSdkModel(model: LanguageModel): AdapterModel {
  type RunState = {
    promptOptions: ReturnType<typeof buildPromptOptions>;
    tools: ReturnType<typeof toAiSdkTools> | undefined;
    toolChoice: ReturnType<typeof toToolChoice> | undefined;
    diagnostics: AdapterDiagnostic[];
    normalizedSchema: NormalizedSchema;
  };

  const createRunState = (call: AdapterModelCall): RunState => {
    const prepared = ModelCall.prepare(call);
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
  ): AdapterModelResult => {
    const usage = toModelUsage(result.usage);
    const diagnostics = state.diagnostics.concat(toDiagnostics(result.warnings));
    ModelUsage.warnIfMissing(diagnostics, usage, "ai-sdk");
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
  ): AdapterModelResult => {
    const usage = toModelUsage(result.usage);
    const totalUsage = toModelUsage(result.totalUsage);
    const collapsedUsage = totalUsage ?? usage;
    const diagnostics = state.diagnostics.concat(toDiagnostics(result.warnings));
    ModelUsage.warnIfMissing(diagnostics, collapsedUsage, "ai-sdk");
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
      toolCalls: toAdapterToolCalls(result.toolCalls),
      toolResults: toAdapterToolResults(result.toolResults),
      reasoning: result.reasoningText ?? result.reasoning,
      diagnostics,
      telemetry,
      trace: toAdapterTrace(telemetry),
      usage: collapsedUsage,
      meta: toMeta(result.response),
      raw: result,
    };
  };

  function generate(call: AdapterModelCall) {
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

  return { generate };
}
