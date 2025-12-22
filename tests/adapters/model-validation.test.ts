import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { validateModelCall } from "#adapters";
import type { AdapterSchema } from "#adapters";
import { makeMessage, makeModelCall, makeSchema } from "./helpers";

const objectSchema = makeSchema({ type: "object", properties: { answer: { type: "string" } } });
const stringSchema = makeSchema({ type: "string" });
const baseCall = makeModelCall();

describe("Adapter model call validation", () => {
  it("flags tools when response schema is present", () => {
    const result = validateModelCall({
      ...baseCall,
      responseSchema: objectSchema,
      tools: [{ name: "tool" }],
    });

    expect(result.allowTools).toBe(false);
    expect(result.diagnostics.map((entry) => entry.message)).toContain(
      "tools_ignored_for_response_schema",
    );
  });

  it("flags tool choice when response schema is present", () => {
    const result = validateModelCall({
      ...baseCall,
      responseSchema: objectSchema,
      toolChoice: "required",
    });

    expect(result.diagnostics.map((entry) => entry.message)).toContain(
      "tool_choice_ignored_for_response_schema",
    );
  });

  it("flags non-object response schemas", () => {
    const result = validateModelCall({
      ...baseCall,
      responseSchema: stringSchema,
    });

    expect(result.diagnostics.map((entry) => entry.message)).toContain(
      "response_schema_not_object",
    );
  });

  it("flags non-object zod response schemas", () => {
    const zodSchema: AdapterSchema = {
      kind: "zod",
      jsonSchema: z.string(),
    };

    const result = validateModelCall({
      ...baseCall,
      responseSchema: zodSchema,
    });

    expect(result.diagnostics.map((entry) => entry.message)).toContain(
      "response_schema_not_object",
    );
  });

  it("warns when tool choice is not supported", () => {
    const result = validateModelCall(
      {
        ...baseCall,
        toolChoice: "required",
      },
      { supportsToolChoice: false },
    );

    expect(result.diagnostics.map((entry) => entry.message)).toContain("tool_choice_not_supported");
  });

  it("warns when response schema conversion fails", () => {
    const invalidSchema: AdapterSchema = {
      kind: "zod",
      jsonSchema: {
        safeParse: () => ({ success: true }),
        toJSONSchema: () => {
          throw new Error("boom");
        },
      },
    };

    const result = validateModelCall({
      ...baseCall,
      responseSchema: invalidSchema,
    });

    expect(result.diagnostics.map((entry) => entry.message)).toContain("response_schema_invalid");
  });

  it("warns when prompt and messages are provided", () => {
    const result = validateModelCall({
      messages: [makeMessage({ content: "there" })],
      prompt: "hi",
    });

    expect(result.diagnostics.map((entry) => entry.message)).toContain(
      "prompt_ignored_when_messages_present",
    );
  });

  it("warns when prompt is set alongside empty messages", () => {
    const result = validateModelCall({
      messages: [],
      prompt: "hi",
    });

    expect(result.diagnostics.map((entry) => entry.message)).toContain(
      "prompt_ignored_when_messages_present",
    );
  });
});
