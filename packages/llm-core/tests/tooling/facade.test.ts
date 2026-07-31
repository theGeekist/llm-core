import { describe, expect, test } from "bun:test";
import { newCoreId, type InvocationId, type ToolCallId } from "#contracts";
import { defineTool } from "../../src/features/tooling/public";
import { readExecutableTool } from "../../src/features/tooling/runtime";

const TOOL_CALL_ID = newCoreId<ToolCallId>("0190bd0c-0000-7000-8000-000000000001");
const INVOCATION_ID = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000000002");

describe("common Tool facade", () => {
  test("hides schema registration and executable binding", async () => {
    const search = defineTool({
      name: "search",
      description: "Search the knowledge base.",
      input: {
        schema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
        validate: (value) =>
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          typeof value.query === "string"
            ? { valid: true }
            : { valid: false, issues: [{ path: "query", code: "required" }] },
      },
      effect: "read-only",
      execute: ({ query }: { query: string }) => `Found ${query}`,
    });

    expect(search).toEqual({
      name: "search",
      description: "Search the knowledge base.",
    });
    expect(search).not.toHaveProperty("spec");
    expect(search).not.toHaveProperty("validate");
    expect(search).not.toHaveProperty("execute");

    const executable = readExecutableTool(search);
    expect(
      await executable.execute({
        call: {
          toolCallId: TOOL_CALL_ID,
          toolId: executable.definition.id,
          toolVersion: executable.definition.version,
          arguments: { query: "sky" },
          invocation: { invocationId: INVOCATION_ID },
        },
      }),
    ).toEqual({
      toolCallId: TOOL_CALL_ID,
      status: "succeeded",
      content: [{ kind: "text", text: "Found sky" }],
    });
  });

  test("fails closed when a meaningful effect omits targets", () => {
    expect(() =>
      defineTool({
        name: "delete",
        description: "Delete a record.",
        input: { schema: {}, validate: () => ({ valid: true }) },
        effect: "destructive",
        execute: () => null,
      }),
    ).toThrow("require explicit targets");
  });
});
