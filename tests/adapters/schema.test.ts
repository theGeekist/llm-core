import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { toJsonSchema, toSchema } from "#adapters";
import { normalizeObjectSchema } from "../../src/adapters/schema";

describe("Adapter schemas", () => {
  const JSON_SCHEMA = "json-schema";

  it("detects zod schemas", () => {
    const schema = z.object({ name: z.string() });
    const adapted = toSchema(schema);
    expect(adapted?.kind).toBe("zod");
  });

  it("detects json schema wrappers", () => {
    const adapted = toSchema({ jsonSchema: { type: "object" } });
    expect(adapted?.kind).toBe(JSON_SCHEMA);
  });

  it("detects raw json schema objects", () => {
    const adapted = toSchema({ type: "object", properties: { name: { type: "string" } } });
    expect(adapted?.kind).toBe(JSON_SCHEMA);
  });

  it("defaults to unknown for primitives", () => {
    const adapted = toSchema("plain");
    expect(adapted?.kind).toBe("unknown");
  });

  it("returns undefined for nullish inputs", () => {
    expect(toSchema(null)).toBeUndefined();
    expect(toSchema(undefined)).toBeUndefined();
  });

  it("maps jsonSchema property directly", () => {
    const adapted = toSchema({ jsonSchema: { type: "string" } });
    expect(adapted).toEqual({ jsonSchema: { type: "string" }, kind: JSON_SCHEMA });
  });

  it("detects $schema json schema objects", () => {
    const adapted = toSchema({ $schema: "http://json-schema.org" });
    expect(adapted?.kind).toBe(JSON_SCHEMA);
  });

  it("normalizes object schemas without properties", () => {
    const result = normalizeObjectSchema({ type: "object" });
    expect(result.isObject).toBe(true);
    expect(result.schema).toMatchObject({ type: "object", properties: {} });
  });

  it("normalizes non-object schemas into object shells", () => {
    const result = normalizeObjectSchema({ type: "string" });
    expect(result.isObject).toBe(false);
    expect(result.schema).toMatchObject({ type: "object", properties: {} });
  });

  it("serializes zod schemas to json schema", () => {
    const schema = z.object({ name: z.string() });
    const adapted = toSchema(schema);
    const json = toJsonSchema(adapted!);
    expect(json).toMatchObject({ type: "object" });
  });
});
