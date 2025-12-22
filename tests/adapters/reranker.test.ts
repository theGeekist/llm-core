import { describe, expect, it } from "bun:test";
import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import { fromLangChainReranker, fromLlamaIndexReranker } from "#adapters";
import { asLlamaIndexPostprocessor } from "./helpers";

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
});
