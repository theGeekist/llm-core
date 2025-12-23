import { describe, expect, it } from "bun:test";
import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { BaseNodePostprocessor } from "@llamaindex/core/postprocessor";
import {
  Document as LlamaDocument,
  MetadataMode,
  type BaseNode,
  type NodeWithScore,
} from "@llamaindex/core/schema";
import * as AiSdk from "ai";
import type { Reranker } from "#workflow";
import { mapMaybe } from "./helpers";

const toRerankerFromLangChain = (compressor: BaseDocumentCompressor): Reranker => ({
  rerank: (query, documents) => {
    const langchainDocs = documents.map(
      (doc) =>
        new LangChainDocument({
          pageContent: doc.text,
          metadata: doc.metadata,
          id: doc.id,
        }),
    );
    return mapMaybe(compressor.compressDocuments(langchainDocs, String(query)), (result) =>
      result.map((doc) => ({
        id: doc.id,
        text: doc.pageContent,
        metadata: doc.metadata,
      })),
    );
  },
});

const toRerankerFromLlama = (reranker: BaseNodePostprocessor): Reranker => ({
  rerank: (query, documents) => {
    const nodes: NodeWithScore[] = documents.map((doc) => ({
      node: new LlamaDocument({ text: doc.text, metadata: doc.metadata }),
      score: doc.score,
    }));
    return mapMaybe(reranker.postprocessNodes(nodes, String(query)), (ranked) =>
      ranked.map((entry) => ({
        id: entry.node.id_,
        text: getLlamaNodeText(entry.node),
        metadata: entry.node.metadata,
        score: entry.score,
      })),
    );
  },
});

const getLlamaNodeText = (node: BaseNode): string => {
  if ("getText" in node && typeof node.getText === "function") {
    return node.getText();
  }
  return node.getContent(MetadataMode.NONE);
};

describe("Interop reranker", () => {
  it("maps LangChain compressor to Reranker", async () => {
    const compressor = {
      compressDocuments: (docs: LangChainDocument[]) => Promise.resolve(docs),
    } as BaseDocumentCompressor;

    const adapted = toRerankerFromLangChain(compressor);
    const result = await adapted.rerank("query", [{ text: "hello" }]);
    expect(result[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex postprocessor to Reranker", async () => {
    const reranker = {
      postprocessNodes: (nodes: NodeWithScore[]) => Promise.resolve(nodes),
    } as BaseNodePostprocessor;

    const adapted = toRerankerFromLlama(reranker);
    const result = await adapted.rerank("query", [{ text: "hello" }]);
    expect(result[0]?.text).toBe("hello");
  });

  it("notes AI SDK has no reranker abstraction", () => {
    expect("BaseDocumentCompressor" in AiSdk).toBe(false);
  });
});
