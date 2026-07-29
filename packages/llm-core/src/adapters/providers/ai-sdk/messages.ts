import type {
  AssistantModelMessage,
  ModelMessage as AiSdkModelMessage,
  ToolModelMessage,
  UserModelMessage,
} from "ai";
import type { JsonValue, PortableContent } from "#contracts";
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

const toToolResultOutput = (parts: PortableContent[], isError?: boolean) => {
  if (parts.length === 1) {
    const part = parts[0];
    if (part?.kind === "json") {
      return { type: isError ? ("error-json" as const) : ("json" as const), value: part.value };
    }
    if (part?.kind === "text") {
      return { type: isError ? ("error-text" as const) : ("text" as const), value: part.text };
    }
  }
  const value = parts
    .map((part) => {
      if (part.kind === "text") {
        return part.text;
      }
      if (part.kind === "json") {
        return toJsonText(part.value);
      }
      return `[${part.kind}:${part.mediaType}]`;
    })
    .join("\n");
  return { type: isError ? ("error-text" as const) : ("text" as const), value };
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
): ToolCallPart => ({
  kind: "tool-call",
  toolCallId: mapToolCallId(input.toolCallId, input.toolName),
  name: input.toolName,
  arguments: (input.input ?? null) as JsonValue,
});
