import { jsonSchema, tool as defineTool, zodSchema } from "ai";
import type { Tool as AiTool } from "ai";
import type { Schema, Tool } from "../types";
import {
  adapterParamsToJsonSchema,
  normalizeObjectSchema,
  toJsonSchema,
  toSchema,
} from "../schema";

type AiJsonSchemaInput = Parameters<typeof jsonSchema>[0];
type AiZodSchemaInput = Parameters<typeof zodSchema>[0];

export function fromAiSdkTool(name: string, tool: AiTool): Tool {
  return {
    name,
    description: tool.description,
    inputSchema: toSchema(tool.inputSchema),
    outputSchema: toSchema(tool.outputSchema),
  };
}

export const toAiSdkFlexibleSchema = (schema: Schema) => {
  const normalized = normalizeObjectSchema(toJsonSchema(schema));
  if (schema.kind === "zod") {
    return zodSchema(schema.jsonSchema as AiZodSchemaInput);
  }
  return jsonSchema(normalized.schema as AiJsonSchemaInput);
};

export function toAiSdkTool(adapterTool: Tool): AiTool {
  const inputSchema =
    adapterTool.inputSchema ??
    toSchema(adapterTool.params ? adapterParamsToJsonSchema(adapterTool.params) : undefined);
  const outputSchema = adapterTool.outputSchema;
  const execute = adapterTool.execute
    ? (input: unknown) => adapterTool.execute?.(input)
    : undefined;
  const toolDefinition: AiTool = {
    description: adapterTool.description ?? undefined,
    inputSchema: inputSchema
      ? toAiSdkFlexibleSchema(inputSchema)
      : jsonSchema(adapterParamsToJsonSchema() as AiJsonSchemaInput),
    outputSchema: outputSchema ? toAiSdkFlexibleSchema(outputSchema) : undefined,
    execute,
  };
  return defineTool(toolDefinition);
}

export const toAiSdkTools = (tools?: Tool[]) => {
  if (!tools || tools.length === 0) {
    return null;
  }
  const entries = tools.map((tool) => [tool.name, toAiSdkTool(tool)] as const);
  return Object.fromEntries(entries);
};
