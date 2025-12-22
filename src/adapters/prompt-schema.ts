import type { AdapterDiagnostic, AdapterPromptSchema, AdapterSchema } from "./types";
import { adapterParamTypeToJsonType } from "./tool-params-schema";

const warn = (message: string, data?: unknown): AdapterDiagnostic => ({
  level: "warn",
  message,
  data,
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isArray = Array.isArray;

const isInteger = (value: unknown) => typeof value === "number" && Number.isInteger(value);

const isType = (value: unknown, type: string) => {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return isObject(value);
    case "array":
      return isArray(value);
    case "integer":
      return isInteger(value);
    default:
      return typeof value === "string";
  }
};

const toJsonSchema = (schema: AdapterPromptSchema) => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const input of schema.inputs) {
    const jsonType = adapterParamTypeToJsonType(input.type);
    properties[input.name] = {
      type: jsonType,
      description: input.description,
    };
    if (input.required) {
      required.push(input.name);
    }
  }
  return {
    type: "object" as const,
    properties,
    required: required.length ? required : undefined,
    additionalProperties: false,
  };
};

export const toPromptInputSchema = (schema: AdapterPromptSchema): AdapterSchema => ({
  name: schema.name,
  jsonSchema: toJsonSchema(schema),
  kind: "json-schema",
});

export const validatePromptInputs = (
  schema: AdapterPromptSchema,
  values: Record<string, unknown>,
): AdapterDiagnostic[] => {
  const diagnostics: AdapterDiagnostic[] = [];
  for (const input of schema.inputs) {
    const value = values[input.name];
    if (input.required && value === undefined) {
      diagnostics.push(
        warn("prompt_input_missing", {
          name: input.name,
          expected: input.type,
        }),
      );
      continue;
    }
    if (value === undefined) {
      continue;
    }
    const expectedType = adapterParamTypeToJsonType(input.type);
    if (!isType(value, expectedType)) {
      diagnostics.push(
        warn("prompt_input_invalid_type", {
          name: input.name,
          expected: expectedType,
          received: typeof value,
        }),
      );
    }
  }
  return diagnostics;
};
