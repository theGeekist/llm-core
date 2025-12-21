import { describe, expect, it } from "bun:test";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { Document as LlamaDocument, type NodeWithScore } from "@llamaindex/core/schema";
import { fromLangChainDocuments, fromLlamaIndexNodes } from "#adapters";

describe("Adapter retrieval helpers", () => {
  it("maps LangChain documents to retrieval result", () => {
    const docs = [new LangChainDocument({ pageContent: "hello" })];
    const result = fromLangChainDocuments(docs, "query");
    expect(result.documents[0]?.text).toBe("hello");
    expect(result.query).toBe("query");
  });

  it("maps LlamaIndex nodes to retrieval result", () => {
    const node = new LlamaDocument({ text: "hello", metadata: { source: "llama" } });
    const nodes: NodeWithScore[] = [{ node, score: 0.9 }];
    const result = fromLlamaIndexNodes(nodes, "query");
    expect(result.documents[0]?.text).toBe("hello");
    expect(result.documents[0]?.score).toBe(0.9);
  });
});
