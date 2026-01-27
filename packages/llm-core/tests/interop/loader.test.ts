import { describe, expect, it } from "bun:test";
import type { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { BaseReader } from "@llamaindex/core/schema";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import * as AiSdk from "ai";
import type { DocumentLoader } from "#workflow";
import { maybeMapArray } from "#shared/maybe";

const toAdapterLoaderFromLangChain = (loader: BaseDocumentLoader): DocumentLoader => ({
  load: () =>
    maybeMapArray(
      (doc) => ({
        id: doc.id,
        text: doc.pageContent,
        metadata: doc.metadata,
      }),
      loader.load(),
    ),
});

const toAdapterLoaderFromLlama = (reader: BaseReader): DocumentLoader => ({
  load: () =>
    maybeMapArray(
      (doc) => ({
        id: doc.id_,
        text: doc.text ?? "",
        metadata: doc.metadata,
      }),
      reader.loadData(),
    ),
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
