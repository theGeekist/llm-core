import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { digest } from "#contracts";
import { registerToolSchema, type ToolSchemaDigestPort } from "../../src/features/tooling/public";

const schemaDigestPort: ToolSchemaDigestPort = {
  digest: (canonicalSchema) => digest(createHash("sha256").update(canonicalSchema).digest("hex")),
};

describe("tool schema registration", () => {
  test("JCS-canonicalizes schemas before SHA-256 registration", async () => {
    const left = await registerToolSchema(
      {
        type: "object",
        required: ["count"],
        properties: { count: { minimum: 0, type: "integer" } },
      },
      schemaDigestPort,
    );
    const reordered = await registerToolSchema(
      {
        properties: { count: { type: "integer", minimum: 0 } },
        required: ["count"],
        type: "object",
      },
      schemaDigestPort,
    );

    expect(left.digest).toEqual(reordered.digest);
  });

  test("any schema-document change changes the registered digest", async () => {
    const integerSchema = await registerToolSchema(
      { type: "object", properties: { count: { type: "integer" } } },
      schemaDigestPort,
    );
    const numberSchema = await registerToolSchema(
      { type: "object", properties: { count: { type: "number" } } },
      schemaDigestPort,
    );

    expect(integerSchema.digest).not.toEqual(numberSchema.digest);
  });

  test("rejects non-JSON and unsafe schema documents before hashing", () => {
    expect(() => registerToolSchema({ minimum: Number.NaN }, schemaDigestPort)).toThrow(TypeError);
  });
});
