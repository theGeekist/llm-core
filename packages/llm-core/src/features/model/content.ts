import type { JsonValue, PortableContent, ToolCallId } from "#contracts";

/**
 * Model message content (ADR-003).
 *
 * Portable content (text/json/binary/media-ref) is reused verbatim from the
 * contracts front. Reasoning and tool lifecycle are model-execution concerns, so
 * they are added here as closed, discriminated parts rather than generic content.
 */

/** Provider reasoning trace surfaced as a first-class, closed part. */
export interface ReasoningPart {
  kind: "reasoning";
  text: string;
}

/** A model-issued tool invocation. */
export interface ToolCallPart {
  kind: "tool-call";
  toolCallId: ToolCallId;
  name: string;
  arguments: JsonValue;
}

/** The result of executing a tool, fed back to the model. */
export interface ToolResultPart {
  kind: "tool-result";
  toolCallId: ToolCallId;
  result: PortableContent[];
  isError?: boolean;
}

/** Closed union of every content part a model message may carry. */
export type ModelContentPart = PortableContent | ReasoningPart | ToolCallPart | ToolResultPart;

export type ModelRole = "system" | "user" | "assistant" | "tool";

export interface ModelMessage {
  role: ModelRole;
  content: ModelContentPart[];
  name?: string;
}
