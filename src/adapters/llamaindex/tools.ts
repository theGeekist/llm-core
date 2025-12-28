import type { BaseTool } from "@llamaindex/core/llms";
import { tool as defineTool } from "@llamaindex/core/tools";
import type { JSONValue } from "@llamaindex/core/global";
import type { AdapterCallContext, Schema, Tool } from "../types";
import { identity, maybeMap } from "../../maybe";
import {
  adapterParamsToJsonSchema,
  normalizeObjectSchema,
  toJsonSchema,
  toSchema,
} from "../schema";
import { reportDiagnostics, validateToolInput } from "../input-validation";

export function fromLlamaIndexTool(tool: BaseTool): Tool {
  const parameters = tool.metadata.parameters;
  const inputSchema = toSchema(parameters);
  const adapterShape: Tool = {
    name: tool.metadata.name,
    description: tool.metadata.description,
    inputSchema,
  };

  const execute = tool.call
    ? (input: unknown, context?: AdapterCallContext) => {
        const diagnostics = validateToolInput(adapterShape, input);
        if (diagnostics.length > 0) {
          reportDiagnostics(context, diagnostics);
          return undefined;
        }
        return maybeMap(identity, tool.call?.(input));
      }
    : undefined;

  return {
    name: tool.metadata.name,
    description: tool.metadata.description,
    inputSchema,
    execute,
  };
}

const toLlamaIndexSchema = (schema: Schema) => normalizeObjectSchema(toJsonSchema(schema)).schema;

export function toLlamaIndexTool(adapterTool: Tool): BaseTool {
  const inputSchema =
    adapterTool.inputSchema ??
    toSchema(adapterTool.params ? adapterParamsToJsonSchema(adapterTool.params) : undefined);
  const schema = inputSchema ? toLlamaIndexSchema(inputSchema) : adapterParamsToJsonSchema();
  const execute = adapterTool.execute
    ? (input: unknown) => maybeMap((value) => value as JSONValue, adapterTool.execute?.(input))
    : (input: unknown) => input as JSONValue;

  return defineTool({
    name: adapterTool.name,
    description: adapterTool.description ?? `${adapterTool.name} tool`,
    parameters: schema,
    execute,
  });
}
