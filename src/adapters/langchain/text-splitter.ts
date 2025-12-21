import type { Document } from "@langchain/core/documents";
import type { TextSplitter } from "@langchain/textsplitters";
import type { AdapterTextSplitter } from "../types";
import { mapMaybe } from "../maybe";

function toWithMetadata(documents: Document[]) {
  return documents.map((doc) => ({ text: doc.pageContent, metadata: doc.metadata }));
}

export function fromLangChainTextSplitter(splitter: TextSplitter): AdapterTextSplitter {
  function split(text: string) {
    return mapMaybe(splitter.splitText(text), (chunks) => chunks);
  }

  function splitBatch(texts: string[]) {
    const pending = Promise.all(texts.map((text) => splitter.splitText(text)));
    return mapMaybe(pending, (chunks) => chunks);
  }

  function splitWithMetadata(text: string) {
    return mapMaybe(splitter.createDocuments([text], [{ source: "langchain" }]), toWithMetadata);
  }

  return { split, splitBatch, splitWithMetadata };
}
