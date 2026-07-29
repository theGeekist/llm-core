import type {
  AssistantModelMessage,
  ModelMessage as AiSdkModelMessage,
  ToolModelMessage,
  UserModelMessage,
} from "ai";
import type { ToolResultOutput } from "@ai-sdk/provider-utils";
import { isJsonValue, type JsonValue, type PortableContent } from "#contracts";
import type {
  ModelContentPart,
  ModelMessage,
  ToolCallPart,
  ToolResultPart,
} from "../../../features/model/public";

type ToolCallIdMapper = (
  providerToolCallId: string,
  toolName: string,
) => ToolCallPart["toolCallId"];
type ProviderToolCallResolver = (toolCallId: ToolResultPart["toolCallId"]) => {
  toolCallId: string;
  toolName: string;
};

const toJsonText = (value: JsonValue): string => JSON.stringify(value);

const toUserPart = (
  part: ModelContentPart,
): Exclude<UserModelMessage["content"], string>[number] | null => {
  if (part.kind === "text") {
    return { type: "text", text: part.text };
  }
  if (part.kind === "json") {
    return { type: "text", text: toJsonText(part.value) };
  }
  if (part.kind === "binary") {
    return {
      type: "file",
      data: part.data,
      mediaType: part.mediaType,
    };
  }
  if (part.kind === "media-ref") {
    throw new TypeError("AI SDK adapter requires resolved media; media-ref is not dereferenced.");
  }
  return null;
};

const assertResolvedToolResultParts = (parts: PortableContent[]): void => {
  if (parts.some((part) => part.kind === "media-ref")) {
    throw new TypeError(
      "AI SDK adapter requires resolved tool-result media; media-ref is not dereferenced.",
    );
  }
};

const toErrorPartJson = (part: PortableContent): JsonValue => {
  if (part.kind === "text") {
    return { kind: "text", text: part.text };
  }
  if (part.kind === "json") {
    return { kind: "json", value: part.value };
  }
  if (part.kind === "binary") {
    return {
      kind: "binary",
      mediaType: part.mediaType,
      encoding: part.encoding,
      data: part.data,
      byteLength: part.byteLength,
      digest: part.digest,
    };
  }
  throw new TypeError("Unresolved media-ref cannot enter an AI SDK tool error.");
};

const toErrorToolResultOutput = (parts: PortableContent[]): ToolResultOutput => ({
  type: "error-json",
  value: parts.map(toErrorPartJson),
});

const toMultipartToolResultOutput = (parts: PortableContent[]): ToolResultOutput => ({
  type: "content",
  value: parts.map((part) => {
    if (part.kind === "text") {
      return { type: "text", text: part.text };
    }
    if (part.kind === "json") {
      return {
        type: "file",
        data: { type: "text", text: toJsonText(part.value) },
        mediaType: "application/json",
      };
    }
    if (part.kind === "binary") {
      return {
        type: "file",
        data: { type: "data", data: part.data },
        mediaType: part.mediaType,
      };
    }
    throw new TypeError("Unresolved media-ref cannot enter an AI SDK tool result.");
  }),
});

const toToolResultOutput = (
  parts: PortableContent[],
  isError?: boolean,
): ToolResultOutput => {
  assertResolvedToolResultParts(parts);
  if (isError) {
    return toErrorToolResultOutput(parts);
  }
  if (parts.length === 1) {
    const part = parts[0];
    if (part?.kind === "json") {
      return { type: "json", value: part.value };
    }
    if (part?.kind === "text") {
      return { type: "text", value: part.text };
    }
  }
  return toMultipartToolResultOutput(parts);
};

const toAssistantPart = (
  part: ModelContentPart,
  resolveProviderToolCall: ProviderToolCallResolver,
): Exclude<AssistantModelMessage["content"], string>[number] | null => {
  if (part.kind === "text") {
    return { type: "text", text: part.text };
  }
  if (part.kind === "reasoning") {
    return { type: "reasoning", text: part.text };
  }
  if (part.kind === "tool-call") {
    const providerCall = resolveProviderToolCall(part.toolCallId);
    return {
      type: "tool-call",
      toolCallId: providerCall.toolCallId,
      toolName: providerCall.toolName === "llm-core-tool" ? part.name : providerCall.toolName,
      input: part.arguments,
    };
  }
  if (part.kind === "binary") {
    return { type: "file", data: part.data, mediaType: part.mediaType };
  }
  if (part.kind === "media-ref") {
    throw new TypeError("AI SDK adapter requires resolved media; media-ref is not dereferenced.");
  }
  if (part.kind === "json") {
    return { type: "text", text: toJsonText(part.value) };
  }
  return null;
};

const toToolParts = (
  message: ModelMessage,
  resolveProviderToolCall: ProviderToolCallResolver,
): ToolModelMessage["content"] =>
  message.content
    .filter((part): part is ToolResultPart => part.kind === "tool-result")
    .map((part) => {
      const providerCall = resolveProviderToolCall(part.toolCallId);
      return {
        type: "tool-result" as const,
        toolCallId: providerCall.toolCallId,
        toolName: providerCall.toolName,
        output: toToolResultOutput(part.result, part.isError),
      };
    });

export const toAiSdk7Messages = (
  messages: ModelMessage[],
  resolveProviderToolCall: ProviderToolCallResolver,
): { instructions?: string; messages: AiSdkModelMessage[] } => {
  const instructions: string[] = [];
  const mapped: AiSdkModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      instructions.push(
        message.content
          .filter((part): part is Extract<ModelContentPart, { kind: "text" }> => part.kind === "text")
          .map((part) => part.text)
          .join("\n"),
      );
      continue;
    }
    if (message.role === "tool") {
      mapped.push({ role: "tool", content: toToolParts(message, resolveProviderToolCall) });
      continue;
    }
    if (message.role === "assistant") {
      const content = message.content
        .map((part) => toAssistantPart(part, resolveProviderToolCall))
        .filter((part): part is Exclude<AssistantModelMessage["content"], string>[number] =>
          Boolean(part),
        );
      mapped.push({ role: "assistant", content });
      continue;
    }
    const content = message.content
      .map(toUserPart)
      .filter((part): part is Exclude<UserModelMessage["content"], string>[number] => Boolean(part));
    mapped.push({ role: "user", content });
  }

  const joinedInstructions = instructions.filter(Boolean).join("\n\n");
  return {
    ...(joinedInstructions ? { instructions: joinedInstructions } : {}),
    messages: mapped,
  };
};

export const toPortableTextPart = (text: string): ModelContentPart => ({ kind: "text", text });

export const toPortableReasoningPart = (text: string): ModelContentPart => ({
  kind: "reasoning",
  text,
});

export const toPortableToolCallPart = (
  input: { toolCallId: string; toolName: string; input: unknown },
  mapToolCallId: ToolCallIdMapper,
): ToolCallPart => {
  if (!isJsonValue(input.input)) {
    throw new TypeError("AI SDK tool call input must be strict JSON.");
  }
  return {
    kind: "tool-call",
    toolCallId: mapToolCallId(input.toolCallId, input.toolName),
    name: input.toolName,
    arguments: input.input,
  };
};
