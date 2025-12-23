import { describe, expect, it } from "bun:test";
import {
  reportDiagnostics,
  validateEmbedderBatchInput,
  validateEmbedderInput,
  validateKvKeys,
  validateKvPairs,
  validateMemoryLoadInput,
  validateMemorySaveInput,
  validateMemoryTurn,
  validateRetrieverInput,
  validateRerankerInput,
  validateStorageKey,
  validateTextSplitterBatchInput,
  validateTextSplitterInput,
  validateThreadId,
  validateToolInput,
  validateTransformerInput,
} from "#adapters";

describe("Adapter input validation", () => {
  it("does nothing when report context is missing", () => {
    expect(() => reportDiagnostics(undefined, [{ level: "warn", message: "x" }])).not.toThrow();
  });

  it("validates missing retriever and reranker inputs", () => {
    expect(validateRetrieverInput(" ")).toHaveLength(1);
    expect(validateRerankerInput("", [])).toHaveLength(2);
  });

  it("validates text splitter inputs", () => {
    expect(validateTextSplitterInput("")).toHaveLength(1);
    expect(validateTextSplitterBatchInput([" "])).toHaveLength(1);
  });

  it("validates embedder inputs", () => {
    expect(validateEmbedderInput("")).toHaveLength(1);
    expect(validateEmbedderBatchInput([" "])).toHaveLength(1);
  });

  it("validates tool and storage inputs", () => {
    expect(
      validateToolInput({ name: "tool", params: [{ name: "q", type: "string" }] }, undefined),
    ).toHaveLength(1);
    expect(validateStorageKey(" ", "get")).toHaveLength(1);
  });

  it("validates kv and memory inputs", () => {
    expect(validateKvKeys([], "mget")).toHaveLength(1);
    expect(validateKvPairs([])).toHaveLength(1);
    expect(validateThreadId("", "append")).toHaveLength(1);
    expect(validateMemoryLoadInput(undefined)).toHaveLength(1);
    expect(validateMemorySaveInput(undefined, undefined)).toHaveLength(2);
    expect(validateMemoryTurn(undefined)).toHaveLength(1);
  });

  it("validates transformer inputs", () => {
    expect(validateTransformerInput([])).toHaveLength(1);
  });
});
