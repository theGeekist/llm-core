import { describe, expect, it } from "bun:test";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import { fromLangChainLoader, fromLlamaIndexLoader } from "#adapters";
import { asLangChainLoader, asLlamaIndexReader } from "./helpers";

describe("Adapter document loaders", () => {
  it("maps LangChain loaders with sync returns", async () => {
    const loader = asLangChainLoader({
      load: () => [new LangChainDocument({ pageContent: "hello" })],
    });

    const adapter = fromLangChainLoader(loader);
    const docs = await adapter.load();
    expect(docs[0]?.text).toBe("hello");
  });

  it("maps LangChain loaders with async returns", async () => {
    const loader = asLangChainLoader({
      load: () => Promise.resolve([new LangChainDocument({ pageContent: "hello" })]),
    });

    const adapter = fromLangChainLoader(loader);
    const docs = await adapter.load();
    expect(docs[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex readers", async () => {
    const reader = asLlamaIndexReader({
      loadData: () => Promise.resolve([new LlamaDocument({ text: "hello" })]),
    });

    const adapter = fromLlamaIndexLoader(reader);
    const docs = await adapter.load();
    expect(docs[0]?.text).toBe("hello");
  });
});
