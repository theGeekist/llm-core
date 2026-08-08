import { describe, expect, test } from "bun:test";
import {
  createAgentJsonOutput,
  createAgentTextOutput,
  isAgentOutput,
  registerAgentOutput,
} from "../../src/features/agent/public";

describe("Agent output", () => {
  test("constructs closed portable text and JSON results", () => {
    expect(createAgentTextOutput("answer")).toEqual({ kind: "text", text: "answer" });
    expect(createAgentJsonOutput({ answer: 42 })).toEqual({
      kind: "json",
      value: { answer: 42 },
    });
  });

  test("rejects untyped, contradictory and undeclared output data", () => {
    expect(isAgentOutput("answer")).toBe(false);
    expect(isAgentOutput({ kind: "text", text: "a", value: "b" })).toBe(false);
    expect(isAgentOutput({ kind: "json", value: { answer: 42 }, native: true })).toBe(false);
    expect(() => registerAgentOutput({ kind: "text", text: 42 })).toThrow("closed portable");
  });

  test("rejects accessors without invoking them", () => {
    let reads = 0;
    const output = { kind: "text" } as Record<string, unknown>;
    Object.defineProperty(output, "text", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "must-not-run";
      },
    });

    expect(isAgentOutput(output)).toBe(false);
    expect(reads).toBe(0);
  });

  test("detaches and freezes registered output", () => {
    const source = { answer: { value: 42 } };
    const output = createAgentJsonOutput(source);
    source.answer.value = 7;
    expect(output).toEqual({ kind: "json", value: { answer: { value: 42 } } });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen((output.value as { answer: object }).answer)).toBe(true);
  });
});
