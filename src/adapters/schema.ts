import { zodToJsonSchema } from "zod-to-json-schema";
import type { AdapterSchema } from "./types";

type SchemaLike = {
  jsonSchema?: unknown;
  safeParse?: unknown;
  toJSONSchema?: (params?: unknown) => unknown;
  _def?: unknown;
  _zod?: unknown;
  def?: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function toAdapterSchema(schema: unknown): AdapterSchema | undefined {
  if (schema === undefined || schema === null) {
    return undefined;
  }

  if (!isObject(schema)) {
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
  isObject(value) && typeof (value as SchemaLike).toJSONSchema === "function";

const isZodSchema = (candidate: SchemaLike) => {
  if (typeof candidate.safeParse !== "function") {
    return false;
  }
  if (typeof candidate.toJSONSchema === "function") {
    return true;
  }
  return "_def" in candidate || "_zod" in candidate || "def" in candidate;
};

const isObjectSchema = (schema: unknown): schema is JsonSchemaObject =>
  isObject(schema) && (schema as { type?: string }).type === "object";

export function normalizeObjectSchema(schema: unknown): {
  schema: JsonSchemaObject;
  isObject: boolean;
} {
  if (isObjectSchema(schema)) {
    if ("properties" in schema) {
      return { schema, isObject: true };
    }
    return { schema: { ...schema, properties: {} }, isObject: true };
  }
  return { schema: { type: "object", properties: {} }, isObject: false };
}

export function toJsonSchema(schema: AdapterSchema): unknown {
  if (schema.kind === "zod") {
    if (hasToJsonSchema(schema.jsonSchema)) {
      try {
        return schema.jsonSchema.toJSONSchema({ target: "draft-07" });
      } catch {
        return zodToJsonSchema(schema.jsonSchema as unknown as ZodToJsonInput);
      }
    }
    return zodToJsonSchema(schema.jsonSchema as unknown as ZodToJsonInput);
  }
  return schema.jsonSchema;
}
