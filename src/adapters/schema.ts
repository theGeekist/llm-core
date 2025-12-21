import type { AdapterSchema } from "./types";

type SchemaLike = {
  jsonSchema?: unknown;
  safeParse?: unknown;
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

  if (typeof candidate.safeParse === "function") {
    return { jsonSchema: schema, kind: "zod" };
  }

  if (candidate.jsonSchema !== undefined) {
    return { jsonSchema: candidate.jsonSchema, kind: "json-schema" };
  }

  if ("type" in candidate || "properties" in candidate || "$schema" in candidate) {
    return { jsonSchema: schema, kind: "json-schema" };
  }

  return { jsonSchema: schema, kind: "unknown" };
}
