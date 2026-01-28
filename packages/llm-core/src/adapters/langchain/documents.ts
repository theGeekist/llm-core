import { Document as LangChainDocument } from "@langchain/core/documents";
import type { Document } from "../types";

export function fromLangChainDocument(doc: LangChainDocument): Document {
  return {
    id: doc.id,
    text: doc.pageContent,
    metadata: doc.metadata,
  };
}

export function toLangChainDocument(doc: Document): LangChainDocument {
  return new LangChainDocument({
    pageContent: doc.text,
    metadata: doc.metadata ?? {},
    id: doc.id,
  });
}
