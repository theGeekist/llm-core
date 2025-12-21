import type { TextSplitter } from "@llamaindex/core/node-parser";
import type { AdapterTextSplitter } from "../types";

function toWithMetadata(chunks: string[]) {
  return chunks.map((chunk) => ({ text: chunk }));
}

export function fromLlamaIndexTextSplitter(splitter: TextSplitter): AdapterTextSplitter {
  function split(text: string) {
    return splitter.splitText(text);
  }

  function splitBatch(texts: string[]) {
    return texts.map((text) => splitter.splitText(text));
  }

  function splitWithMetadata(text: string) {
    return toWithMetadata(splitter.splitText(text));
  }

  return { split, splitBatch, splitWithMetadata };
}
