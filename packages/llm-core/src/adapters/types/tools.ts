import type { AdapterCallContext, AdapterMetadata } from "./core";
import type { Schema, SchemaField } from "./schema";
import type { MaybePromise } from "#shared/maybe";

export type ToolParam = SchemaField;

export type Tool = {
  name: string;
  description?: string | null;
  params?: ToolParam[] | null;
  inputSchema?: Schema | null;
  outputSchema?: Schema | null;
  execute?: ((input: unknown, context?: AdapterCallContext) => MaybePromise<unknown>) | null;
  metadata?: AdapterMetadata | null;
};

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  id?: string | null;
};

export type ToolResult = {
  name: string;
  result: unknown;
  toolCallId?: string | null;
  isError?: boolean | null;
};
