import type { Document } from "@langchain/core/documents";
import type { TextSplitter as LanchainTextSplitter } from "@langchain/textsplitters";
import type { AdapterCallContext, TextSplitter } from "../types";
import { maybeAll } from "@wpkernel/pipeline/core/async-utils";
import { maybeMap } from "../../maybe";
import {
  reportDiagnostics,
  validateTextSplitterBatchInput,
  validateTextSplitterInput,
} from "../input-validation";

function toWithMetadata(documents: Document[]) {
  return documents.map((doc) => ({ text: doc.pageContent, metadata: doc.metadata }));
}

export function fromLangChainTextSplitter(splitter: LanchainTextSplitter): TextSplitter {
  function split(text: string, context?: AdapterCallContext) {
    const diagnostics = validateTextSplitterInput(text);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return maybeMap((chunks) => chunks, splitter.splitText(text));
  }

  function splitBatch(texts: string[], context?: AdapterCallContext) {
    const diagnostics = validateTextSplitterBatchInput(texts);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return maybeMap((chunks) => chunks, maybeAll(texts.map((text) => splitter.splitText(text))));
  }

  function splitWithMetadata(text: string, context?: AdapterCallContext) {
    const diagnostics = validateTextSplitterInput(text);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return maybeMap(toWithMetadata, splitter.createDocuments([text], [{ source: "langchain" }]));
  }

  return { split, splitBatch, splitWithMetadata };
}
