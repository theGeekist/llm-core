import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { toAdapterSchema } from "#adapters";

describe("Adapter schemas", () => {
  const JSON_SCHEMA = "json-schema";

  it("detects zod schemas", () => {
    const schema = z.object({ name: z.string() });
    const adapted = toAdapterSchema(schema);
    expect(adapted?.kind).toBe("zod");
  });

  it("detects json schema wrappers", () => {
    const adapted = toAdapterSchema({ jsonSchema: { type: "object" } });
    expect(adapted?.kind).toBe(JSON_SCHEMA);
  });

  it("detects raw json schema objects", () => {
    const adapted = toAdapterSchema({ type: "object", properties: { name: { type: "string" } } });
    expect(adapted?.kind).toBe(JSON_SCHEMA);
  });

  it("defaults to unknown for primitives", () => {
    const adapted = toAdapterSchema("plain");
    expect(adapted?.kind).toBe("unknown");
  });

  it("returns undefined for nullish inputs", () => {
    expect(toAdapterSchema(null)).toBeUndefined();
    expect(toAdapterSchema(undefined)).toBeUndefined();
  });

  it("maps jsonSchema property directly", () => {
    const adapted = toAdapterSchema({ jsonSchema: { type: "string" } });
    expect(adapted).toEqual({ jsonSchema: { type: "string" }, kind: JSON_SCHEMA });
  });

  it("detects $schema json schema objects", () => {
    const adapted = toAdapterSchema({ $schema: "http://json-schema.org" });
    expect(adapted?.kind).toBe(JSON_SCHEMA);
  });
});
