import { zodToJsonSchema } from "zod-to-json-schema";
import type { AdapterDiagnostic, PromptSchema, Schema, ToolParam } from "./types";
import { isRecord, warnDiagnostic } from "./utils";

type SchemaLike = {
  jsonSchema?: unknown;
  safeParse?: unknown;
  toJSONSchema?: (params?: unknown) => unknown;
  _def?: unknown;
  _zod?: unknown;
  def?: unknown;
};

export function toSchema(schema: unknown): Schema | undefined {
  if (schema === undefined || schema === null) {
    return undefined;
  }

  if (!isRecord(schema)) {
    return { jsonSchema: schema, kind: "unknown" };
  }

  const candidate = schema as SchemaLike;

  if (candidate.jsonSchema !== undefined) {
    return { jsonSchema: candidate.jsonSchema, kind: "json-schema" };
  }

  if (isZodSchema(candidate)) {
    return { jsonSchema: schema, kind: "zod" };
  }

  if ("type" in candidate || "properties" in candidate || "$schema" in candidate) {
    return { jsonSchema: schema, kind: "json-schema" };
  }

  return { jsonSchema: schema, kind: "unknown" };
}

type ZodToJsonInput = Parameters<typeof zodToJsonSchema>[0];

type JsonSchemaObject = Record<string, unknown>;

const hasToJsonSchema = (
  value: unknown,
): value is { toJSONSchema: (params?: unknown) => unknown } =>
  isRecord(value) && typeof (value as SchemaLike).toJSONSchema === "function";

const isZodSchema = (candidate: SchemaLike) => {
  if (typeof candidate.safeParse !== "function") {
    return false;
  }
  if (typeof candidate.toJSONSchema === "function") {
    return true;
  }
  return "_def" in candidate || "_zod" in candidate || "def" in candidate;
};

const isRecordSchema = (schema: unknown): schema is JsonSchemaObject =>
  isRecord(schema) && (schema as { type?: string }).type === "object";

export function normalizeObjectSchema(schema: unknown): {
  schema: JsonSchemaObject;
  isRecord: boolean;
} {
  if (isRecordSchema(schema)) {
    if ("properties" in schema) {
      return { schema, isRecord: true };
    }
    return { schema: { ...schema, properties: {} }, isRecord: true };
  }
  return { schema: { type: "object", properties: {} }, isRecord: false };
}

export function toJsonSchema(schema: Schema): unknown {
  return toJsonSchemaWithDiagnostics(schema).schema;
}

export function toJsonSchemaWithDiagnostics(schema: Schema): {
  schema: unknown;
  warning?: { message: string; error?: unknown };
} {
  if (schema.kind === "zod") {
    if (hasToJsonSchema(schema.jsonSchema)) {
      try {
        return { schema: schema.jsonSchema.toJSONSchema({ target: "draft-07" }) };
      } catch (error) {
        return {
          schema: zodToJsonSchema(schema.jsonSchema as unknown as ZodToJsonInput),
          warning: { message: "response_schema_invalid", error },
        };
      }
    }
    return { schema: zodToJsonSchema(schema.jsonSchema as unknown as ZodToJsonInput) };
  }
  return { schema: schema.jsonSchema };
}

// Expects JSON Schema primitive types; unknowns default to "string".
export const adapterParamTypeToJsonType = (type: string) => {
  switch (type) {
    case "string":
    case "number":
    case "boolean":
    case "object":
    case "array":
    case "integer":
      return type;
    default:
      return "string";
  }
};

type ObjectSchemaField = {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
};

const buildObjectSchema = (fields: ObjectSchemaField[]) => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of fields) {
    properties[field.name] = {
      type: adapterParamTypeToJsonType(field.type),
      description: field.description,
    };
    if (field.required) {
      required.push(field.name);
    }
  }
  return {
    type: "object" as const,
    properties,
    required: required.length ? required : undefined,
    additionalProperties: false,
  };
};

export const adapterParamsToJsonSchema = (params: ToolParam[] = []) => buildObjectSchema(params);

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
      return isRecord(value);
    case "array":
      return isArray(value);
    case "integer":
      return isInteger(value);
    default:
      return typeof value === "string";
  }
};

const toPromptJsonSchema = (schema: PromptSchema) => buildObjectSchema(schema.inputs);

export const toPromptInputSchema = (schema: PromptSchema): Schema => ({
  name: schema.name,
  jsonSchema: toPromptJsonSchema(schema),
  kind: "json-schema",
});

export const validatePromptInputs = (
  schema: PromptSchema,
  values: Record<string, unknown>,
): AdapterDiagnostic[] => {
  const diagnostics: AdapterDiagnostic[] = [];
  for (const input of schema.inputs) {
    const value = values[input.name];
    if (input.required && value === undefined) {
      diagnostics.push(
        warnDiagnostic("prompt_input_missing", {
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
        warnDiagnostic("prompt_input_invalid_type", {
          name: input.name,
          expected: expectedType,
          received: typeof value,
        }),
      );
    }
  }
  return diagnostics;
};
