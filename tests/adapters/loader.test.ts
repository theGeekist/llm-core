import { describe, expect, it } from "bun:test";
import type { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { BaseReader } from "@llamaindex/core/schema";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import { fromLangChainLoader, fromLlamaIndexLoader } from "#adapters";

describe("Adapter document loaders", () => {
  it("maps LangChain loaders with sync returns", async () => {
    const loader = {
      load: () => [new LangChainDocument({ pageContent: "hello" })],
    } as unknown as BaseDocumentLoader;

    const adapter = fromLangChainLoader(loader);
    const docs = await adapter.load();
    expect(docs[0]?.text).toBe("hello");
  });

  it("maps LangChain loaders with async returns", async () => {
    const loader = {
      load: () => Promise.resolve([new LangChainDocument({ pageContent: "hello" })]),
    } as unknown as BaseDocumentLoader;

    const adapter = fromLangChainLoader(loader);
    const docs = await adapter.load();
    expect(docs[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex readers", async () => {
    const reader = {
      loadData: () => Promise.resolve([new LlamaDocument({ text: "hello" })]),
    } as unknown as BaseReader;

    const adapter = fromLlamaIndexLoader(reader);
    const docs = await adapter.load();
    expect(docs[0]?.text).toBe("hello");
  });
});
