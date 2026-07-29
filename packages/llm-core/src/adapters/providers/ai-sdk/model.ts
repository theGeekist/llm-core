import {
  generateText,
  Output,
  streamText,
  type ContentPart,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import {
  isJsonValue,
  newCoreId,
  type InvocationContext,
  type JsonValue,
  type ToolCallId,
} from "#contracts";
import type {
  Model,
  ModelContentPart,
  ModelError,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
} from "../../../features/model/public";
import {
  toAiSdk7Messages,
  toPortableReasoningPart,
  toPortableTextPart,
  toPortableToolCallPart,
} from "./messages";
import { toModelUsage, toModelWarnings, toResponseMetadata } from "./metadata";
import { toAiSdk7ToolApproval, toAiSdk7Tools } from "./tools";
import type { CreateAiSdk7ModelInput } from "./types";

type ToolCallLike = { toolCallId: string; toolName: string; input: unknown };
type ProviderToolCall = { toolCallId: string; toolName: string };
type InvocationCorrelation = {
  providerToCore: Map<string, ToolCallId>;
  coreToProvider: Map<ToolCallId, ProviderToolCall>;
};
type CoreToolCallOwner = ProviderToolCall & {
  invocationId: InvocationContext["invocationId"];
};
type MapToolCallInput = ProviderToolCall & {
  context: InvocationContext;
  correlation: InvocationCorrelation;
};

const defaultToolCallId = (): ToolCallId => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return newCoreId<ToolCallId>(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  );
};

const toError = (error: unknown): ModelError => {
  const name = error instanceof Error ? error.name : undefined;
  return {
    code: name === "AbortError" ? "timeout" : "provider-error",
    message:
      name === "AbortError"
        ? "AI SDK provider call was cancelled."
        : "AI SDK provider call failed.",
    retryable: false,
    ...(name ? { providerCode: name } : {}),
  };
};

const isToolCall = (part: ContentPart<ToolSet> | TextStreamPart<ToolSet>): part is ContentPart<ToolSet> &
  ToolCallLike => part.type === "tool-call";

const approvalFact = (
  part: ContentPart<ToolSet>,
  mapToolCallId: (providerToolCallId: string, toolName: string) => ToolCallId,
): JsonValue | undefined =>
  part.type === "tool-approval-request"
    ? {
        approvalId: part.approvalId,
        toolCallId: mapToolCallId(part.toolCall.toolCallId, part.toolCall.toolName),
        toolName: part.toolCall.toolName,
        isAutomatic: part.isAutomatic ?? false,
      }
    : undefined;

const toCompletionContent = (
  parts: Array<ContentPart<ToolSet>>,
  mapToolCallId: (providerToolCallId: string, toolName: string) => ToolCallId,
): ModelContentPart[] => {
  const content: ModelContentPart[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      content.push(toPortableTextPart(part.text));
    } else if (part.type === "reasoning") {
      content.push(toPortableReasoningPart(part.text));
    } else if (isToolCall(part)) {
      content.push(toPortableToolCallPart(part, mapToolCallId));
    } else if (part.type === "tool-result") {
      const output = isJsonValue(part.output) ? part.output : null;
      content.push({
        kind: "tool-result",
        toolCallId: mapToolCallId(part.toolCallId, part.toolName),
        result: [{ kind: "json", value: output }],
      });
    }
  }
  return content;
};

const toToolChoice = (request: ModelRequest) =>
  request.toolChoice?.kind === "tool"
    ? { type: "tool" as const, toolName: request.toolChoice.name }
    : request.toolChoice?.kind;

export const createAiSdk7Model = (input: CreateAiSdk7ModelInput): Model => {
  const correlations = new Map<InvocationContext["invocationId"], InvocationCorrelation>();
  const coreToolCallOwners = new Map<ToolCallId, CoreToolCallOwner>();

  const correlationFor = (context: InvocationContext): InvocationCorrelation => {
    const existing = correlations.get(context.invocationId);
    if (existing) {
      return existing;
    }
    const created = {
      providerToCore: new Map<string, ToolCallId>(),
      coreToProvider: new Map<ToolCallId, ProviderToolCall>(),
    };
    correlations.set(context.invocationId, created);
    return created;
  };

  const mapToolCallId = (mapping: MapToolCallInput): ToolCallId => {
    const existing = mapping.correlation.providerToCore.get(mapping.toolCallId);
    if (existing) {
      const reverse = mapping.correlation.coreToProvider.get(existing);
      if (
        !reverse ||
        reverse.toolCallId !== mapping.toolCallId ||
        reverse.toolName !== mapping.toolName
      ) {
        throw new TypeError("AI SDK provider tool-call identity collision.");
      }
      return existing;
    }

    const created = input.createToolCallId?.(mapping.toolCallId) ?? defaultToolCallId();
    const reverseCollision = mapping.correlation.coreToProvider.get(created);
    const ownerCollision = coreToolCallOwners.get(created);
    if (
      reverseCollision ||
      (ownerCollision &&
        (ownerCollision.invocationId !== mapping.context.invocationId ||
          ownerCollision.toolCallId !== mapping.toolCallId ||
          ownerCollision.toolName !== mapping.toolName))
    ) {
      throw new TypeError("AI SDK core tool-call identity collision.");
    }

    const providerCall = { toolCallId: mapping.toolCallId, toolName: mapping.toolName };
    mapping.correlation.providerToCore.set(mapping.toolCallId, created);
    mapping.correlation.coreToProvider.set(created, providerCall);
    coreToolCallOwners.set(created, {
      ...providerCall,
      invocationId: mapping.context.invocationId,
    });
    return created;
  };

  const resolveProviderToolCall = (
    correlation: InvocationCorrelation,
    toolCallId: ToolCallId,
  ): ProviderToolCall => {
    const providerCall = correlation.coreToProvider.get(toolCallId);
    if (!providerCall) {
      throw new TypeError("Unknown AI SDK tool-call identity for this invocation.");
    }
    return providerCall;
  };

  const buildOptions = (request: ModelRequest, context: InvocationContext) => {
    const correlation = correlationFor(context);
    const prompt = toAiSdk7Messages(request.messages, (toolCallId) =>
      resolveProviderToolCall(correlation, toolCallId),
    );
    const tools = toAiSdk7Tools(request.tools);
    return {
      model: input.model,
      ...prompt,
      tools,
      toolChoice: toToolChoice(request),
      toolApproval: toAiSdk7ToolApproval({
        request,
        context,
        classify: input.classifyToolApproval,
      }),
      abortSignal: input.resolveAbortSignal?.(context),
      temperature: request.sampling?.temperature,
      topP: request.sampling?.topP,
      maxOutputTokens: request.sampling?.maxOutputTokens,
      stopSequences: request.sampling?.stopSequences,
      seed: request.sampling?.seed,
    };
  };

  const createInvocationToolCallMapper = (
    context: InvocationContext,
    correlation: InvocationCorrelation,
  ) => {
    return (providerToolCallId: string, toolName: string) =>
      mapToolCallId({
        context,
        correlation,
        toolCallId: providerToolCallId,
        toolName,
      });
  };

  const generate = async (
    request: ModelRequest,
    context: InvocationContext,
  ): Promise<ModelResponse> => {
    try {
      const options = buildOptions(request, context);
      const correlation = correlationFor(context);
      const mapInvocationToolCallId = createInvocationToolCallMapper(context, correlation);
      const result =
        request.responseFormat?.kind === "json"
          ? await generateText({ ...options, output: Output.json() })
          : await generateText(options);
      const approvalRequests = result.content
        .map((part) => approvalFact(part, mapInvocationToolCallId))
        .filter((part): part is JsonValue => part !== undefined);
      const content =
        request.responseFormat?.kind === "json" && isJsonValue(result.output)
          ? [{ kind: "json" as const, value: result.output }]
          : toCompletionContent(result.content, mapInvocationToolCallId);
      return {
        kind: "completion",
        content,
        finishReason: result.finishReason,
        usage: toModelUsage(result.usage),
        warnings: toModelWarnings(result.warnings),
        metadata: toResponseMetadata({
          profile: input.profile,
          response: result.response,
          providerMetadata: result.providerMetadata,
          redactProviderMetadata: input.redactProviderMetadata,
          approvalRequests,
        }),
      };
    } catch (error) {
      return {
        kind: "error",
        error: toError(error),
        metadata: toResponseMetadata({ profile: input.profile }),
      };
    }
  };

  const stream = async function* (
    request: ModelRequest,
    context: InvocationContext,
  ): AsyncIterable<ModelStreamEvent> {
    let usage: ReturnType<typeof toModelUsage>;
    try {
      const result = streamText(buildOptions(request, context));
      const correlation = correlationFor(context);
      const mapInvocationToolCallId = createInvocationToolCallMapper(context, correlation);
      yield { kind: "start" };
      for await (const part of result.stream) {
        if (part.type === "text-delta") {
          yield { kind: "delta", part: toPortableTextPart(part.text) };
        } else if (part.type === "reasoning-delta") {
          yield { kind: "delta", part: toPortableReasoningPart(part.text) };
        } else if (isToolCall(part)) {
          yield {
            kind: "delta",
            part: toPortableToolCallPart(part, mapInvocationToolCallId),
          };
        } else if (part.type === "error") {
          yield { kind: "error", error: toError(part.error) };
          return;
        } else if (part.type === "abort") {
          yield { kind: "error", error: toError(new DOMException("Aborted", "AbortError")) };
          return;
        }
      }
      usage = toModelUsage(await result.usage);
      if (usage) {
        yield { kind: "usage", usage };
      }
      yield { kind: "finish", finishReason: await result.finishReason, usage };
    } catch (error) {
      yield { kind: "error", error: toError(error) };
    }
  };

  return {
    profile: input.profile,
    generate,
    stream,
  };
};
