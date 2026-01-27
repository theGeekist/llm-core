import { describe, expect, it } from "bun:test";
import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import { fromAiSdkReranker, fromLangChainReranker, fromLlamaIndexReranker } from "#adapters";
import { asAiSdkReranker, asLlamaIndexPostprocessor, captureDiagnostics } from "./helpers";

const asPromiseLike = <T>(value: T): PromiseLike<T> => Promise.resolve(value);

describe("Adapter rerankers", () => {
  it("maps LangChain compressors", async () => {
    const compressor = {
      compressDocuments: (docs: LangChainDocument[]) => Promise.resolve(docs),
    } as BaseDocumentCompressor;

    const adapter = fromLangChainReranker(compressor);
    const result = await adapter.rerank("query", [{ text: "hello" }]);
    expect(result[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex postprocessors", async () => {
    const reranker = asLlamaIndexPostprocessor({
      postprocessNodes: (nodes: Array<{ node: LlamaDocument }>) =>
        Promise.resolve(nodes.map((entry) => ({ ...entry, score: 0.9 }))),
    });

    const adapter = fromLlamaIndexReranker(reranker);
    const result = await adapter.rerank("query", [{ text: "hello" }]);
    expect(result[0]?.text).toBe("hello");
  });

  it("maps AI SDK reranking models", async () => {
    const model = asAiSdkReranker({
      specificationVersion: "v3",
      provider: "test",
      modelId: "rerank",
      doRerank: () =>
        asPromiseLike({
          ranking: [
            { index: 1, relevanceScore: 0.9 },
            { index: 0, relevanceScore: 0.5 },
          ],
        }),
    });
    const adapter = fromAiSdkReranker(model);
    const result = await adapter.rerank("query", [{ text: "first" }, { text: "second" }]);
    expect(result[0]?.text).toBe("second");
    expect(result[0]?.score).toBe(0.9);
  });

  it("skips AI SDK ranking entries that point to missing documents", async () => {
    const model = asAiSdkReranker({
      specificationVersion: "v3",
      provider: "test",
      modelId: "rerank",
      doRerank: () =>
        asPromiseLike({
          ranking: [{ index: 2, relevanceScore: 0.9 }],
        }),
    });
    const adapter = fromAiSdkReranker(model);
    const result = await adapter.rerank("query", [{ text: "first" }]);
    expect(result).toEqual([]);
  });

  it("warns when reranker inputs are missing", async () => {
    const compressor = {
      compressDocuments: (docs: LangChainDocument[]) => Promise.resolve(docs),
    } as BaseDocumentCompressor;
    const adapter = fromLangChainReranker(compressor);
    const { context, diagnostics } = captureDiagnostics();

    const result = await adapter.rerank(" ", [], context);
    expect(result).toEqual([]);
    expect(diagnostics.map((entry) => entry.message)).toEqual([
      "reranker_documents_missing",
      "reranker_query_missing",
    ]);
  });

  it("reports diagnostics for AI SDK reranker inputs", async () => {
    const model = asAiSdkReranker({
      specificationVersion: "v3",
      provider: "test",
      modelId: "rerank",
      doRerank: () => asPromiseLike({ ranking: [] }),
    });
    const adapter = fromAiSdkReranker(model);
    const { context, diagnostics } = captureDiagnostics();

    const result = await adapter.rerank(" ", [], context);
    expect(result).toEqual([]);
    expect(diagnostics.map((entry) => entry.message)).toEqual([
      "reranker_documents_missing",
      "reranker_query_missing",
    ]);
  });
});
