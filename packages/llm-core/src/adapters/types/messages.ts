import type { AdapterMetadata } from "./core";

export type MessageRole = "system" | "user" | "assistant" | "tool";

type MediaFields = {
  mimeType?: string | null;
  mediaType?: string | null;
};

type MediaPartBase = MediaFields & {
  data?: string | null;
};

type BinaryPartBase = MediaFields & {
  data: string;
};

export type TextPart = {
  type: "text";
  text: string;
};

export type ImagePart = MediaPartBase & {
  type: "image";
  url?: string | null;
  detail?: "high" | "low" | "auto" | null;
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
  toolCallId?: string | null;
  toolName: string;
  input: unknown;
};

export type ToolResultPart = {
  type: "tool-result";
  toolCallId?: string | null;
  toolName: string;
  output: unknown;
  isError?: boolean | null;
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
  raw?: unknown | null;
};

export type MessageContent = string | StructuredContent;

export type Message = {
  role: MessageRole;
  content: MessageContent;
  name?: string | null;
  toolCallId?: string | null;
  metadata?: AdapterMetadata | null;
};
