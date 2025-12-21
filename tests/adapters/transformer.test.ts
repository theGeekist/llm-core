import { describe, expect, it } from "bun:test";
import type { BaseDocumentTransformer } from "@langchain/core/documents";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { NodeParser } from "@llamaindex/core/node-parser";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import { fromLangChainTransformer, fromLlamaIndexTransformer } from "#adapters";

describe("Adapter transformers", () => {
  it("maps LangChain transformers", async () => {
    const transformer = {
      transformDocuments: (docs: LangChainDocument[]) => Promise.resolve(docs),
    } as BaseDocumentTransformer;

    const adapter = fromLangChainTransformer(transformer);
    const result = await adapter.transform([{ text: "hello" }]);
    expect(result[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex node parsers", async () => {
    const parser = {
      getNodesFromDocuments: (docs: LlamaDocument[]) => Promise.resolve(docs),
    } as unknown as NodeParser;

    const adapter = fromLlamaIndexTransformer(parser);
    const result = await adapter.transform([{ text: "hello" }]);
    expect(result[0]?.text).toBe("hello");
  });
});
