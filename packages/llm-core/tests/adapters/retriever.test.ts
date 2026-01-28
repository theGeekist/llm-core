import { describe, expect, it } from "bun:test";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { Document as LlamaDocument, type NodeWithScore } from "@llamaindex/core/schema";
import { fromLangChainRetriever, fromLlamaIndexRetriever } from "#adapters";
import { asLangChainRetriever, asLlamaIndexRetriever, captureDiagnostics } from "./helpers";

describe("Adapter retrievers", () => {
  it("maps LangChain retriever with sync returns", async () => {
    const retriever = asLangChainRetriever(() => [new LangChainDocument({ pageContent: "hello" })]);

    const adapter = fromLangChainRetriever(retriever);
    const result = await adapter.retrieve("query");
    expect(result.documents[0]?.text).toBe("hello");
  });

  it("maps LangChain retriever with async returns", async () => {
    const retriever = asLangChainRetriever(() =>
      Promise.resolve([new LangChainDocument({ pageContent: "hello" })]),
    );

    const adapter = fromLangChainRetriever(retriever);
    const result = await adapter.retrieve("query");
    expect(result.documents[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex retriever with async returns", async () => {
    const node = new LlamaDocument({ text: "hello", metadata: { source: "llama" } });
    const nodes: NodeWithScore[] = [{ node, score: 0.9 }];
    const retriever = asLlamaIndexRetriever(() => Promise.resolve(nodes));

    const adapter = fromLlamaIndexRetriever(retriever);
    const result = await adapter.retrieve("query");
    expect(result.documents[0]?.text).toBe("hello");
  });

  it("warns when retriever queries are missing", async () => {
    const retriever = asLangChainRetriever(() => [new LangChainDocument({ pageContent: "hello" })]);
    const adapter = fromLangChainRetriever(retriever);
    const { context, diagnostics } = captureDiagnostics();

    const result = await adapter.retrieve("   ", context);
    expect(result.documents).toBeArrayOfSize(0);
    expect(diagnostics[0]?.message).toBe("retriever_query_missing");
  });

  it("warns when LlamaIndex retriever queries are missing", async () => {
    const retriever = asLlamaIndexRetriever(() => Promise.resolve([]));
    const adapter = fromLlamaIndexRetriever(retriever);
    const { context, diagnostics } = captureDiagnostics();

    const result = await adapter.retrieve(" ", context);
    expect(result.documents).toBeArrayOfSize(0);
    expect(diagnostics[0]?.message).toBe("retriever_query_missing");
  });
});
