import { jsonSchema, tool as defineTool, zodSchema } from "ai";
import type { Tool } from "ai";
import type { AdapterSchema, AdapterTool } from "../types";
import { normalizeObjectSchema, toAdapterSchema, toJsonSchema } from "../schema";
import { adapterParamsToJsonSchema } from "../tool-params-schema";

type AiJsonSchemaInput = Parameters<typeof jsonSchema>[0];
type AiZodSchemaInput = Parameters<typeof zodSchema>[0];

type ToolSchemaInput = Tool["inputSchema"];
type ToolWithParams = Tool & { parameters?: ToolSchemaInput };

const readToolSchema = (tool: Tool): ToolSchemaInput => {
  const extended = tool as ToolWithParams;
  return extended.inputSchema ?? extended.parameters;
};

export function fromAiSdkTool(name: string, tool: Tool): AdapterTool {
  return {
    name,
    description: tool.description,
    inputSchema: toAdapterSchema(readToolSchema(tool)),
    outputSchema: toAdapterSchema(tool.outputSchema),
  };
}

const toAiSdkFlexibleSchema = (schema: AdapterSchema) => {
  const normalized = normalizeObjectSchema(toJsonSchema(schema));
  if (schema.kind === "zod" && normalized.isObject) {
    return zodSchema(schema.jsonSchema as AiZodSchemaInput);
  }
  return jsonSchema(normalized.schema as AiJsonSchemaInput);
};

export function toAiSdkTool(adapterTool: AdapterTool): Tool {
  const inputSchema =
    adapterTool.inputSchema ??
    toAdapterSchema(adapterTool.params ? adapterParamsToJsonSchema(adapterTool.params) : undefined);
  const outputSchema = adapterTool.outputSchema;
  const toolDefinition: Tool = {
    description: adapterTool.description,
    inputSchema: inputSchema
      ? toAiSdkFlexibleSchema(inputSchema)
      : jsonSchema(adapterParamsToJsonSchema() as AiJsonSchemaInput),
    outputSchema: outputSchema ? toAiSdkFlexibleSchema(outputSchema) : undefined,
    execute: adapterTool.execute,
  };
  return defineTool(toolDefinition);
}

export const toAiSdkTools = (tools?: AdapterTool[]) => {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  const entries = tools.map((tool) => [tool.name, toAiSdkTool(tool)] as const);
  return Object.fromEntries(entries);
};
