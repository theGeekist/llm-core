import { describe, expect, it } from "bun:test";
import type { BaseRetrieverInterface } from "@langchain/core/retrievers";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { BaseRetriever as LlamaRetriever } from "@llamaindex/core/retriever";
import { Document as LlamaDocument, type NodeWithScore } from "@llamaindex/core/schema";
import { fromLangChainRetriever, fromLlamaIndexRetriever } from "#adapters";

describe("Adapter retrievers", () => {
  it("maps LangChain retriever with sync returns", async () => {
    const retriever = {
      invoke: () => [new LangChainDocument({ pageContent: "hello" })],
    } as unknown as BaseRetrieverInterface;

    const adapter = fromLangChainRetriever(retriever);
    const result = await adapter.retrieve("query");
    expect(result.documents[0]?.text).toBe("hello");
  });

  it("maps LangChain retriever with async returns", async () => {
    const retriever = {
      invoke: () => Promise.resolve([new LangChainDocument({ pageContent: "hello" })]),
    } as unknown as BaseRetrieverInterface;

    const adapter = fromLangChainRetriever(retriever);
    const result = await adapter.retrieve("query");
    expect(result.documents[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex retriever with async returns", async () => {
    const node = new LlamaDocument({ text: "hello", metadata: { source: "llama" } });
    const nodes: NodeWithScore[] = [{ node, score: 0.9 }];
    const retriever = {
      retrieve: () => Promise.resolve(nodes),
    } as unknown as LlamaRetriever;

    const adapter = fromLlamaIndexRetriever(retriever);
    const result = await adapter.retrieve("query");
    expect(result.documents[0]?.text).toBe("hello");
  });
});
