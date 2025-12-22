import { describe, expect, it } from "bun:test";
import type { BaseDocumentTransformer } from "@langchain/core/documents";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import { fromLangChainTransformer, fromLlamaIndexTransformer } from "#adapters";
import { asLlamaIndexParser } from "./helpers";

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
    const parser = asLlamaIndexParser({
      getNodesFromDocuments: (docs: LlamaDocument[]) => Promise.resolve(docs),
    });

    const adapter = fromLlamaIndexTransformer(parser);
    const result = await adapter.transform([{ text: "hello" }]);
    expect(result[0]?.text).toBe("hello");
  });
});
