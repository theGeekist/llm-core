import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { toAdapterSchema } from "#adapters";

describe("Adapter schemas", () => {
  it("detects zod schemas", () => {
    const schema = z.object({ name: z.string() });
    const adapted = toAdapterSchema(schema);
    expect(adapted?.kind).toBe("zod");
  });

  it("detects json schema wrappers", () => {
    const adapted = toAdapterSchema({ jsonSchema: { type: "object" } });
    expect(adapted?.kind).toBe("json-schema");
  });

  it("detects raw json schema objects", () => {
    const adapted = toAdapterSchema({ type: "object", properties: { name: { type: "string" } } });
    expect(adapted?.kind).toBe("json-schema");
  });

  it("defaults to unknown for primitives", () => {
    const adapted = toAdapterSchema("plain");
    expect(adapted?.kind).toBe("unknown");
  });
});
