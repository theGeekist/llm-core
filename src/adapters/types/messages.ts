import type { AdapterMetadata } from "./core";

export type MessageRole = "system" | "user" | "assistant" | "tool";

type MediaPartBase = {
  data?: string;
  mimeType?: string;
  mediaType?: string;
};

type BinaryPartBase = {
  data: string;
  mimeType?: string;
  mediaType?: string;
};

export type TextPart = {
  type: "text";
  text: string;
};

export type ImagePart = MediaPartBase & {
  type: "image";
  url?: string;
  detail?: "high" | "low" | "auto";
};

export type FilePart = BinaryPartBase & {
  type: "file";
};

export type ReasoningPart = {
  type: "reasoning";
  text: string;
};

export type ToolCallPart = {
  type: "tool-call";
  toolCallId?: string;
  toolName: string;
  input: unknown;
};

export type ToolResultPart = {
  type: "tool-result";
  toolCallId?: string;
  toolName: string;
  output: unknown;
  isError?: boolean;
};

export type DataPart = {
  type: "data";
  data: unknown;
};

export type MessagePart =
  | DataPart
  | FilePart
  | ImagePart
  | ReasoningPart
  | TextPart
  | ToolCallPart
  | ToolResultPart;

export type StructuredContent = {
  text: string;
  parts: MessagePart[];
  raw?: unknown;
};

export type MessageContent = string | StructuredContent;

export type Message = {
  role: MessageRole;
  content: MessageContent;
  name?: string;
  toolCallId?: string;
  metadata?: AdapterMetadata;
};
