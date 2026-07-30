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
  isUuidV7,
  newCoreId,
  type InvocationContext,
  type JsonValue,
  type ToolCallId,
} from "#contracts";
import {
  isRegisteredModelProfile,
  type Model,
  type ModelContentPart,
  type ModelError,
  type ModelRequest,
} from "../../../features/model/public";
import {
  toAiSdk7Messages,
  toPortableReasoningPart,
  toPortableTextPart,
  toPortableToolCallPart,
} from "./messages";
import { toModelUsage, toModelWarnings, toResponseMetadata } from "./metadata";
import { toAiSdk7ToolApproval, toAiSdk7Tools } from "./tools";
import type {
  AiSdk7ToolCallCorrelation,
  AiSdk7ToolCallCorrelationScope,
  CreateAiSdk7ModelInput,
} from "./types";

type ToolCallLike = { toolCallId: string; toolName: string; input: unknown };
type ProviderToolCall = { toolCallId: string; toolName: string };
type InvocationCorrelation = {
  providerToCore: Map<string, ToolCallId>;
  coreToProvider: Map<ToolCallId, ProviderToolCall>;
  pending: AiSdk7ToolCallCorrelation[];
};
type CorrelationScope = {
  scope: AiSdk7ToolCallCorrelationScope;
  correlation: InvocationCorrelation;
};
type MapToolCallInput = ProviderToolCall & {
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
    code: name === "AbortError" ? "cancelled" : "provider-error",
    message:
      name === "AbortError"
        ? "AI SDK provider call was cancelled."
        : "AI SDK provider call failed.",
    retryable: false,
    ...(name ? { providerCode: name } : {}),
  };
};

const isToolCall = (
  part: ContentPart<ToolSet> | TextStreamPart<ToolSet>,
): part is ContentPart<ToolSet> & ToolCallLike => part.type === "tool-call";

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
  if (!isRegisteredModelProfile(input.profile)) {
    throw new TypeError("AI SDK adapters require a registered model profile.");
  }
  const correlationScopeFor = async (context: InvocationContext): Promise<CorrelationScope> => {
    const scope: AiSdk7ToolCallCorrelationScope = context.conversationId
      ? { kind: "conversation", conversationId: context.conversationId }
      : { kind: "invocation", invocationId: context.invocationId };
    const stored = await input.toolCallCorrelationStore.load({ scope });
    const correlation: InvocationCorrelation = {
      providerToCore: new Map<string, ToolCallId>(),
      coreToProvider: new Map<ToolCallId, ProviderToolCall>(),
      pending: [],
    };
    for (const entry of stored) {
      const providerCollision = correlation.providerToCore.get(entry.providerToolCallId);
      const coreCollision = correlation.coreToProvider.get(entry.coreToolCallId);
      if (
        !entry.providerToolCallId ||
        !entry.toolName ||
        !isUuidV7(entry.coreToolCallId) ||
        (providerCollision !== undefined &&
          (providerCollision !== entry.coreToolCallId ||
            correlation.coreToProvider.get(providerCollision)?.toolName !== entry.toolName)) ||
        (coreCollision !== undefined &&
          (coreCollision.toolCallId !== entry.providerToolCallId ||
            coreCollision.toolName !== entry.toolName))
      ) {
        throw new TypeError("AI SDK correlation storage returned invalid or conflicting data.");
      }
      correlation.providerToCore.set(entry.providerToolCallId, entry.coreToolCallId);
      correlation.coreToProvider.set(entry.coreToolCallId, {
        toolCallId: entry.providerToolCallId,
        toolName: entry.toolName,
      });
    }
    return { scope, correlation };
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
    if (!isUuidV7(created)) {
      throw new TypeError("AI SDK tool-call identity factories must mint UUIDv7 IDs.");
    }
    const reverseCollision = mapping.correlation.coreToProvider.get(created);
    if (reverseCollision) {
      throw new TypeError("AI SDK core tool-call identity collision.");
    }

    const providerCall = { toolCallId: mapping.toolCallId, toolName: mapping.toolName };
    mapping.correlation.providerToCore.set(mapping.toolCallId, created);
    mapping.correlation.coreToProvider.set(created, providerCall);
    mapping.correlation.pending.push({
      providerToolCallId: mapping.toolCallId,
      coreToolCallId: created,
      toolName: mapping.toolName,
    });
    return created;
  };

  const flushCorrelations = async (scope: CorrelationScope): Promise<void> => {
    const pending = scope.correlation.pending.splice(0);
    if (pending.length > 0) {
      await input.toolCallCorrelationStore.record({
        scope: scope.scope,
        correlations: pending,
      });
    }
  };

  const resolveProviderToolCall = (
    correlation: InvocationCorrelation,
    toolCallId: ToolCallId,
  ): ProviderToolCall => {
    const providerCall = correlation.coreToProvider.get(toolCallId);
    if (!providerCall) {
      throw new TypeError("Unknown AI SDK tool-call identity for this conversation or invocation.");
    }
    return providerCall;
  };

  const buildOptions = (
    request: ModelRequest,
    context: InvocationContext,
    correlation: InvocationCorrelation,
  ) => {
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

  const createInvocationToolCallMapper = (scope: CorrelationScope) => {
    return (providerToolCallId: string, toolName: string) =>
      mapToolCallId({
        correlation: scope.correlation,
        toolCallId: providerToolCallId,
        toolName,
      });
  };

  const generate: Model["generate"] = async ({ request, context }) => {
    try {
      const scope = await correlationScopeFor(context);
      const options = buildOptions(request, context, scope.correlation);
      const mapInvocationToolCallId = createInvocationToolCallMapper(scope);
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
      await flushCorrelations(scope);
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

  const stream: NonNullable<Model["stream"]> = async function* ({ request, context }) {
    let usage: ReturnType<typeof toModelUsage>;
    try {
      const scope = await correlationScopeFor(context);
      const result = streamText(buildOptions(request, context, scope.correlation));
      const mapInvocationToolCallId = createInvocationToolCallMapper(scope);
      yield { kind: "start" };
      for await (const part of result.stream) {
        if (part.type === "text-delta") {
          yield { kind: "delta", part: toPortableTextPart(part.text) };
        } else if (part.type === "reasoning-delta") {
          yield { kind: "delta", part: toPortableReasoningPart(part.text) };
        } else if (isToolCall(part)) {
          const portablePart = toPortableToolCallPart(part, mapInvocationToolCallId);
          await flushCorrelations(scope);
          yield {
            kind: "delta",
            part: portablePart,
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
