import type { AdapterCallContext, AdapterMetadata } from "./core";
import type { Schema, SchemaField } from "./schema";
import type { MaybePromise } from "../../maybe";

export type ToolParam = SchemaField;

export type Tool = {
  name: string;
  description?: string;
  params?: ToolParam[];
  inputSchema?: Schema;
  outputSchema?: Schema;
  execute?: (input: unknown, context?: AdapterCallContext) => MaybePromise<unknown>;
  metadata?: AdapterMetadata;
};

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
};

export type ToolResult = {
  name: string;
  result: unknown;
  toolCallId?: string;
  isError?: boolean;
};
