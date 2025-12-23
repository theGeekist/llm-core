import { describe, expect, it } from "bun:test";
import type { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { BaseReader } from "@llamaindex/core/schema";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import * as AiSdk from "ai";
import type { DocumentLoader } from "#workflow";
import { mapMaybeArray } from "./helpers";

const toAdapterLoaderFromLangChain = (loader: BaseDocumentLoader): DocumentLoader => ({
  load: () =>
    mapMaybeArray(loader.load(), (doc) => ({
      id: doc.id,
      text: doc.pageContent,
      metadata: doc.metadata,
    })),
});

const toAdapterLoaderFromLlama = (reader: BaseReader): DocumentLoader => ({
  load: () =>
    mapMaybeArray(reader.loadData(), (doc) => ({
      id: doc.id_,
      text: doc.text ?? "",
      metadata: doc.metadata,
    })),
});

describe("Interop loader", () => {
  it("maps LangChain document loader to DocumentLoader", async () => {
    const loader = {
      load: () => Promise.resolve([new LangChainDocument({ pageContent: "hello" })]),
    } as BaseDocumentLoader;

    const adapted = toAdapterLoaderFromLangChain(loader);
    const result = await adapted.load();
    expect(result[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex reader to DocumentLoader", async () => {
    const reader = {
      loadData: () => Promise.resolve([new LlamaDocument({ text: "hello" })]),
    } as BaseReader;

    const adapted = toAdapterLoaderFromLlama(reader);
    const result = await adapted.load();
    expect(result[0]?.text).toBe("hello");
  });

  it("notes AI SDK has no loader abstraction", () => {
    expect("BaseReader" in AiSdk).toBe(false);
  });
});
