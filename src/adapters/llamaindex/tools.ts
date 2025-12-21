import type { BaseTool } from "@llamaindex/core/llms";
import type { AdapterTool } from "../types";
import { identity, mapMaybe } from "../maybe";
import { toAdapterSchema } from "../schema";

export function fromLlamaIndexTool(tool: BaseTool): AdapterTool {
  const parameters = tool.metadata.parameters;
  const inputSchema = toAdapterSchema(parameters);

  const execute = tool.call
    ? (input: unknown) => mapMaybe(tool.call?.(input), identity)
    : undefined;

  return {
    name: tool.metadata.name,
    description: tool.metadata.description,
    inputSchema,
    execute,
  };
}
