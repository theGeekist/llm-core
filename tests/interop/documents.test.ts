import { describe, expect, it } from "bun:test";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import * as AiSdk from "ai";
import type { AdapterDocument } from "#workflow";

const toAdapterDocumentFromLangChain = (doc: LangChainDocument): AdapterDocument => ({
  id: doc.id,
  text: doc.pageContent,
  metadata: doc.metadata,
});

const toAdapterDocumentFromLlama = (doc: LlamaDocument): AdapterDocument => ({
  id: doc.id_,
  text: doc.text,
  metadata: doc.metadata,
});

describe("Interop documents", () => {
  it("maps LangChain Document to AdapterDocument", () => {
    const doc = new LangChainDocument({
      pageContent: "Hello",
      metadata: { source: "langchain" },
      id: "lc-1",
    });

    const adapted = toAdapterDocumentFromLangChain(doc);
    expect(adapted).toEqual({
      id: "lc-1",
      text: "Hello",
      metadata: { source: "langchain" },
    });
  });

  it("maps LlamaIndex Document to AdapterDocument", () => {
    const doc = new LlamaDocument({
      text: "Hello",
      metadata: { source: "llama" },
    });

    const adapted = toAdapterDocumentFromLlama(doc);
    expect(adapted.text).toBe("Hello");
    expect(adapted.metadata).toEqual({ source: "llama" });
  });

  it("notes AI SDK has no Document abstraction", () => {
    expect("Document" in AiSdk).toBe(false);
  });
});
