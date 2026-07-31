import { describe, expect, test } from "bun:test";
import { newCoreId, type InvocationId, type JsonValue, type ToolCallId } from "#contracts";
import { defineTool, type ToolConfig } from "../../src/features/tooling/public";
import {
  readExecutableTool,
  type ToolArgumentValidationResult,
} from "../../src/features/tooling/runtime";

const TOOL_CALL_ID = newCoreId<ToolCallId>("0190bd0c-0000-7000-8000-000000000001");
const INVOCATION_ID = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000000002");

describe("common Tool facade", () => {
  test("snapshots validator and executor callbacks at definition time", async () => {
    const input = {
      schema: { type: "object" },
      validate: (_value: JsonValue): ToolArgumentValidationResult => ({ valid: true }),
    };
    const config = {
      name: "snapshot",
      description: "Keep the original callback behavior.",
      input,
      effect: "read-only" as const,
      execute: (_value: JsonValue) => "original",
    };
    const tool = defineTool(config);

    input.validate = (): ToolArgumentValidationResult => ({
      valid: false,
      issues: [{ path: "", code: "changed" }],
    });
    config.execute = () => "changed";

    const executable = readExecutableTool(tool);
    expect(
      await executable.execute({
        call: {
          toolCallId: TOOL_CALL_ID,
          toolId: executable.definition.id,
          toolVersion: executable.definition.version,
          arguments: {},
          invocation: { invocationId: INVOCATION_ID },
        },
      }),
    ).toEqual({
      toolCallId: TOOL_CALL_ID,
      status: "succeeded",
      content: [{ kind: "text", text: "original" }],
    });
  });

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

  test("rejects invalid arguments before the executor runs", () => {
    let executions = 0;
    const tool = defineTool({
      name: "validated",
      description: "Reject invalid input before execution.",
      input: {
        schema: { type: "object" },
        validate: (): ToolArgumentValidationResult => ({
          valid: false,
          issues: [{ path: "input", code: "invalid" }],
        }),
      },
      effect: "read-only",
      execute: () => {
        executions += 1;
        return null;
      },
    });
    const executable = readExecutableTool(tool);

    expect(() =>
      executable.execute({
        call: {
          toolCallId: TOOL_CALL_ID,
          toolId: executable.definition.id,
          toolVersion: executable.definition.version,
          arguments: {},
          invocation: { invocationId: INVOCATION_ID },
        },
      }),
    ).toThrow("Tool arguments do not satisfy");
    expect(executions).toBe(0);
  });

  test("rejects non-portable executor results for an explicit effect target", () => {
    const tool = defineTool({
      name: "write",
      description: "Reject non-portable output.",
      input: { schema: {}, validate: () => ({ valid: true }) },
      effect: { class: "external-write", targets: [{ kind: "service", id: "billing-api" }] },
      execute: () => new Date() as unknown as JsonValue,
    });
    const executable = readExecutableTool(tool);

    expect(() =>
      executable.execute({
        call: {
          toolCallId: TOOL_CALL_ID,
          toolId: executable.definition.id,
          toolVersion: executable.definition.version,
          arguments: {},
          invocation: { invocationId: INVOCATION_ID },
        },
      }),
    ).toThrow("portable JSON");
  });

  test("fails closed for malformed runtime definitions", () => {
    const invalidDefinitions: readonly unknown[] = [
      {
        name: "missing-input",
        description: "Reject missing input.",
        input: undefined,
        effect: "read-only",
        execute: () => null,
      },
      {
        name: "invalid-schema",
        description: "Reject non-JSON schemas.",
        input: { schema: new Date(), validate: () => ({ valid: true }) },
        effect: "read-only",
        execute: () => null,
      },
      {
        name: "missing-executor",
        description: "Reject missing executors.",
        input: { schema: {}, validate: () => ({ valid: true }) },
        effect: "read-only",
        execute: undefined,
      },
    ];

    for (const definition of invalidDefinitions) {
      expect(() => defineTool(definition as ToolConfig)).toThrow("Tool definitions require");
    }
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
