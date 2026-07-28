import type { TextSplitter as LlamaindexTextSplitter } from "@llamaindex/core/node-parser";
import type { AdapterRequest, TextSplitter } from "../types";
import {
  reportDiagnostics,
  validateTextSplitterBatchInput,
  validateTextSplitterInput,
} from "../input-validation";

function toWithMetadata(chunks: string[]) {
  return chunks.map((chunk) => ({ text: chunk }));
}

export function fromLlamaIndexTextSplitter(splitter: LlamaindexTextSplitter): TextSplitter {
  function split({ text, context }: AdapterRequest<{ text: string }>) {
    const diagnostics = validateTextSplitterInput(text);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return splitter.splitText(text);
  }

  function splitBatch({ texts, context }: AdapterRequest<{ texts: string[] }>) {
    const diagnostics = validateTextSplitterBatchInput(texts);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return texts.map((text) => splitter.splitText(text));
  }

  function splitWithMetadata({ text, context }: AdapterRequest<{ text: string }>) {
    const diagnostics = validateTextSplitterInput(text);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return toWithMetadata(splitter.splitText(text));
  }

  return { split, splitBatch, splitWithMetadata };
}
