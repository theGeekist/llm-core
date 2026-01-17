import { describe, expect, it } from "bun:test";
import {
  inputs,
  toAgentInput,
  toEvalInput,
  toHitlInput,
  toIngestInput,
  toLoopInput,
} from "../../src/recipes/inputs";

describe("recipes inputs", () => {
  it("uses text for rag input and query when only text is provided", () => {
    const result = inputs.rag({ text: "hello" });

    expect(result.input).toBe("hello");
    expect(result.query).toBe("hello");
  });

  it("uses query for rag input when query is provided", () => {
    const result = inputs.rag({ query: "search" });

    expect(result.input).toBe("search");
    expect(result.query).toBe("search");
  });

  it("maps chat.simple inputs with thread id", () => {
    const result = inputs.chatSimple({ text: "hi", threadId: "thread-1" });

    expect(result.input).toBe("hi");
    expect(result.threadId).toBe("thread-1");
  });

  it("maps agent inputs with context and thread id", () => {
    const result = toAgentInput({ text: "ask", context: "ctx", threadId: "thread-2" });

    expect(result.input).toBe("ask");
    expect(result.context).toBe("ctx");
    expect(result.threadId).toBe("thread-2");
  });

  it("maps HITL inputs with decision fields", () => {
    const result = toHitlInput({ text: "approve", decision: "yes", notes: "ok" });

    expect(result.input).toBe("approve");
    expect(result.decision).toBe("yes");
    expect(result.notes).toBe("ok");
  });

  it("maps loop inputs and preserves max iterations", () => {
    const result = toLoopInput({ text: "loop", maxIterations: 3 });

    expect(result.input).toBe("loop");
    expect(result.maxIterations).toBe(3);
  });

  it("maps ingest inputs with documents", () => {
    const result = toIngestInput({ sourceId: "source-1", documents: [{ text: "doc" }] });

    expect(result.sourceId).toBe("source-1");
    expect(result.documents?.length).toBe(1);
  });

  it("maps eval inputs with dataset metadata", () => {
    const result = toEvalInput({ prompt: "score", datasetId: "set-1", candidates: 2 });

    expect(result.prompt).toBe("score");
    expect(result.datasetId).toBe("set-1");
    expect(result.candidates).toBe(2);
  });
});
