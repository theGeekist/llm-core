import { describe, expect, test } from "bun:test";
import { Document as LangChainDocument } from "@langchain/core/documents";
import {
  Comparison,
  StructuredQuery as LangChainStructuredQuery,
} from "@langchain/core/structured_query";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import type { RerankingModelV3 } from "@ai-sdk/provider";
import { createAiSdkReranker } from "../../src/adapters/providers/ai-sdk/retrieval/public";
import {
  fromLangChainDocument,
  fromLangChainStructuredQuery,
  toLangChainDocument,
} from "../../src/adapters/frameworks/langchain/retrieval/public";
import {
  fromLlamaIndexDocument,
  toLlamaIndexDocument,
} from "../../src/adapters/frameworks/llamaindex/retrieval/public";
import {
  documentText,
  textDocument,
  textRetrievalQuery,
} from "../../src/features/retrieval/public";

describe("qualified retrieval adapters", () => {
  test("round-trips LangChain documents through the neutral public front", () => {
    const native = new LangChainDocument({
      id: "lc-1",
      pageContent: "hello",
      metadata: { source: "langchain" },
    });
    const portable = fromLangChainDocument(native);
    const returned = toLangChainDocument(portable);

    expect(documentText(portable)).toBe("hello");
    expect(portable.metadata).toEqual({ source: "langchain" });
    expect(returned.pageContent).toBe("hello");
    expect(returned.id).toBe("lc-1");
  });

  test("drops non-JSON native metadata instead of leaking live values", () => {
    const native = new LangChainDocument({
      pageContent: "hello",
      metadata: { live: () => "native" },
    });
    expect(fromLangChainDocument(native).metadata).toBeUndefined();
  });

  test("converts LangChain structured queries to closed kind discriminants", () => {
    const native = new LangChainStructuredQuery(
      "articles",
      new Comparison("eq", "status", "published"),
    );
    expect(fromLangChainStructuredQuery(native)).toEqual({
      query: "articles",
      filter: {
        kind: "comparison",
        comparator: "eq",
        attribute: "status",
        value: "published",
      },
    });
  });

  test("fails closed instead of weakening unsupported LangChain filters", () => {
    const unsupportedValue = new LangChainStructuredQuery(
      "articles",
      new Comparison("eq", "publishedAt", new Date("2026-01-01")) as never,
    );
    expect(() => fromLangChainStructuredQuery(unsupportedValue)).toThrow("portable scalar");

    const unsupportedDirective = new LangChainStructuredQuery("articles", {
      comparator: "eq",
      attribute: "status",
      value: "published",
    } as never);
    expect(() => fromLangChainStructuredQuery(unsupportedDirective)).toThrow(
      "Unsupported LangChain",
    );
  });

  test("round-trips LlamaIndex documents without retaining a native handle", () => {
    const native = new LlamaDocument({
      id_: "li-1",
      text: "hello",
      metadata: { source: "llamaindex" },
    });
    const portable = fromLlamaIndexDocument(native);
    const returned = toLlamaIndexDocument(portable);

    expect(documentText(portable)).toBe("hello");
    expect(returned.text).toBe("hello");
    expect(returned.id_).toBe("li-1");
    expect(portable).not.toBe(native);
  });

  test("maps AI SDK ranking and keeps the original portable document shape", async () => {
    const model = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "reranker",
      doRerank: () =>
        Promise.resolve({
          ranking: [
            { index: 1, relevanceScore: 0.9 },
            { index: 0, relevanceScore: 0.2 },
          ],
        }),
    } as unknown as RerankingModelV3;
    const reranker = createAiSdkReranker(model);
    const documents = [textDocument("one"), textDocument("two")];
    const ranked = await reranker.rerank(
      { query: textRetrievalQuery("order"), documents },
      { invocationId: "0190bd0c-0000-7000-8000-000000001412" as never },
    );

    expect(ranked.map(documentText)).toEqual(["two", "one"]);
    expect(ranked.map((document) => document.score)).toEqual([0.9, 0.2]);
    expect(documents.every((document) => document.score === undefined)).toBe(true);
  });
});
