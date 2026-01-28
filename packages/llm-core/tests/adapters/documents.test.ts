import { describe, expect, it } from "bun:test";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import {
  fromLangChainDocument,
  fromLlamaIndexDocument,
  toLangChainDocument,
  toLlamaIndexDocument,
} from "#adapters";

describe("Adapter documents", () => {
  it("maps LangChain documents", () => {
    const doc = new LangChainDocument({
      pageContent: "Hello",
      metadata: { source: "langchain" },
      id: "lc-1",
    });

    const adapter = fromLangChainDocument(doc);
    expect(adapter).toEqual({
      id: "lc-1",
      text: "Hello",
      metadata: { source: "langchain" },
    });
  });

  it("maps LlamaIndex documents", () => {
    const doc = new LlamaDocument({ text: "Hello", metadata: { source: "llama" } });
    const adapter = fromLlamaIndexDocument(doc);
    expect(adapter.text).toBe("Hello");
    expect(adapter.metadata).toEqual({ source: "llama" });
  });

  it("creates LangChain documents from Document", () => {
    const doc = toLangChainDocument({ text: "Hello", metadata: { source: "langchain" } });
    expect(doc.pageContent).toBe("Hello");
    expect(doc.metadata).toEqual({ source: "langchain" });
  });

  it("creates LlamaIndex documents from Document", () => {
    const doc = toLlamaIndexDocument({ text: "Hello", metadata: { source: "llama" } });
    expect(doc.text).toBe("Hello");
    expect(doc.metadata).toEqual({ source: "llama" });
  });
});
