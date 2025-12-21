import type { Tool } from "ai";
import type { AdapterTool } from "../types";
import { toAdapterSchema } from "../schema";

export function fromAiSdkTool(name: string, tool: Tool): AdapterTool {
  return {
    name,
    description: tool.description,
    inputSchema: toAdapterSchema(tool.inputSchema),
    outputSchema: toAdapterSchema(tool.outputSchema),
  };
}
