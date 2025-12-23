import { describe, expect, it, mock } from "bun:test";
import type { Schema } from "#adapters";

describe("Adapter schema conversion", () => {
  it("falls back to zod-to-json-schema when toJSONSchema throws", async () => {
    mock.module("zod-to-json-schema", () => ({
      zodToJsonSchema: () => ({ type: "object", mocked: true }),
    }));

    const { toJsonSchema } = await import("../../src/adapters/schema");
    const schema: Schema = {
      kind: "zod",
      jsonSchema: {
        safeParse: () => ({ success: true }),
        toJSONSchema: () => {
          throw new Error("boom");
        },
      },
    };

    const json = toJsonSchema(schema);
    expect(json).toMatchObject({ mocked: true });
  });
});
