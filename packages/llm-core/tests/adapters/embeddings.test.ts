import { describe, expect, it, mock } from "bun:test";
import { fromLangChainEmbeddings, fromLlamaIndexEmbeddings } from "#adapters";
import { asLangChainEmbeddings, asLlamaIndexEmbeddings, captureDiagnostics } from "./helpers";

describe("Adapter embeddings", () => {
  it("maps LangChain embeddings with sync returns", () => {
    const embeddings = asLangChainEmbeddings({
      embedQuery: () => [0.1, 0.2],
      embedDocuments: () => [[0.1, 0.2]],
    });

    const adapter = fromLangChainEmbeddings(embeddings);
    expect(adapter.embed("hi")).toEqual([0.1, 0.2]);
    expect(adapter.embedMany?.(["hi"])).toEqual([[0.1, 0.2]]);
  });

  it("maps LangChain embeddings with async returns", async () => {
    const embeddings = asLangChainEmbeddings({
      embedQuery: () => Promise.resolve([0.3, 0.4]),
      embedDocuments: () => Promise.resolve([[0.3, 0.4]]),
    });

    const adapter = fromLangChainEmbeddings(embeddings);
    await expect(adapter.embed("hi")).resolves.toEqual([0.3, 0.4]);
    await expect(adapter.embedMany?.(["hi"])).resolves.toEqual([[0.3, 0.4]]);
  });

  it("maps LlamaIndex embeddings with sync and async returns", async () => {
    const embedding = asLlamaIndexEmbeddings({
      getTextEmbedding: () => [0.5, 0.6],
      getTextEmbeddings: () => Promise.resolve([[0.5, 0.6]]),
    });

    const adapter = fromLlamaIndexEmbeddings(embedding);
    expect(adapter.embed("hi")).toEqual([0.5, 0.6]);
    await expect(adapter.embedMany?.(["hi"])).resolves.toEqual([[0.5, 0.6]]);
  });

  it("warns when embeddings inputs are missing", () => {
    const embeddings = asLangChainEmbeddings({
      embedQuery: () => [0.1],
      embedDocuments: () => [[0.1]],
    });
    const adapter = fromLangChainEmbeddings(embeddings);
    const { context, diagnostics } = captureDiagnostics();

    expect(adapter.embed("", context)).toEqual([]);
    expect(diagnostics[0]?.message).toBe("embedder_input_missing");
  });

  it("warns when LangChain batch embeddings inputs are missing", () => {
    const embeddings = asLangChainEmbeddings({
      embedQuery: () => [0.1],
      embedDocuments: () => [[0.1]],
    });
    const adapter = fromLangChainEmbeddings(embeddings);
    const { context, diagnostics } = captureDiagnostics();

    expect(adapter.embedMany?.([" "], context)).toEqual([]);
    expect(diagnostics[0]?.message).toBe("embedder_input_missing");
  });

  it("warns when LlamaIndex batch embeddings inputs are missing", () => {
    const embedding = asLlamaIndexEmbeddings({
      getTextEmbedding: () => [0.5, 0.6],
      getTextEmbeddings: () => [[0.5, 0.6]],
    });
    const adapter = fromLlamaIndexEmbeddings(embedding);
    const { context, diagnostics } = captureDiagnostics();

    expect(adapter.embedMany?.([" "], context)).toEqual([]);
    expect(diagnostics[0]?.message).toBe("embedder_input_missing");
  });

  it("warns when LlamaIndex embedding input is missing", () => {
    const embedding = asLlamaIndexEmbeddings({
      getTextEmbedding: () => [0.5, 0.6],
      getTextEmbeddings: () => [[0.5, 0.6]],
    });
    const adapter = fromLlamaIndexEmbeddings(embedding);
    const { context, diagnostics } = captureDiagnostics();

    expect(adapter.embed(" ", context)).toEqual([]);
    expect(diagnostics[0]?.message).toBe("embedder_input_missing");
  });

  it("exposes AI SDK embedding adapters", async () => {
    const mockEmbed = ({ value }: { value: string }) =>
      value === "async"
        ? Promise.resolve({ embedding: [value.length] })
        : { embedding: [value.length] };

    const mockEmbedMany = ({ values }: { values: string[] }) =>
      values.includes("async")
        ? Promise.resolve({ embeddings: values.map((entry) => [entry.length]) })
        : { embeddings: values.map((entry) => [entry.length]) };

    mock.module("ai", () => ({
      embed: mockEmbed,
      embedMany: mockEmbedMany,
    }));
    const { fromAiSdkEmbeddings } = await import("../../src/adapters/ai-sdk/embeddings.ts");
    const adapter = fromAiSdkEmbeddings("test-model" as never);
    expect(adapter.embed).toBeFunction();
    expect(adapter.embedMany).toBeFunction();
    expect(adapter.embed("hi")).toEqual([2]);
    await expect(adapter.embed("async")).resolves.toEqual([5]);
    expect(adapter.embedMany?.(["a", "abcd"])).toEqual([[1], [4]]);
    await expect(adapter.embedMany?.(["a", "async"])).resolves.toEqual([[1], [5]]);
    mock.restore();
  });

  it("warns when AI SDK embedding inputs are missing", async () => {
    const { context, diagnostics } = captureDiagnostics();
    const { fromAiSdkEmbeddings } = await import("../../src/adapters/ai-sdk/embeddings.ts");
    const adapter = fromAiSdkEmbeddings("test-model" as never);

    expect(adapter.embed(" ", context)).toEqual([]);
    expect(adapter.embedMany?.([], context)).toEqual([]);
    expect(diagnostics.map((entry) => entry.message)).toContain("embedder_input_missing");
  });
});
