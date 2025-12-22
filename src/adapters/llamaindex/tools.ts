import type { BaseTool } from "@llamaindex/core/llms";
import { tool as defineTool } from "@llamaindex/core/tools";
import type { JSONValue } from "@llamaindex/core/global";
import type { AdapterSchema, AdapterTool } from "../types";
import { identity, mapMaybe } from "../../maybe";
import { normalizeObjectSchema, toAdapterSchema, toJsonSchema } from "../schema";
import { adapterParamsToJsonSchema } from "../tool-params-schema";

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

const toLlamaIndexSchema = (schema: AdapterSchema) =>
  normalizeObjectSchema(toJsonSchema(schema)).schema;

export function toLlamaIndexTool(adapterTool: AdapterTool): BaseTool {
  const inputSchema =
    adapterTool.inputSchema ??
    toAdapterSchema(adapterTool.params ? adapterParamsToJsonSchema(adapterTool.params) : undefined);
  const schema = inputSchema ? toLlamaIndexSchema(inputSchema) : adapterParamsToJsonSchema();
  const execute = adapterTool.execute
    ? (input: unknown) => mapMaybe(adapterTool.execute?.(input), (value) => value as JSONValue)
    : (input: unknown) => input as JSONValue;

  return defineTool({
    name: adapterTool.name,
    description: adapterTool.description ?? `${adapterTool.name} tool`,
    parameters: schema,
    execute,
  });
}
