import { Document as LangChainDocument } from "@langchain/core/documents";
import type { AdapterDocument } from "../types";

export function fromLangChainDocument(doc: LangChainDocument): AdapterDocument {
  return {
    id: doc.id,
    text: doc.pageContent,
    metadata: doc.metadata,
  };
}

export function toLangChainDocument(doc: AdapterDocument): LangChainDocument {
  return new LangChainDocument({
    pageContent: doc.text,
    metadata: doc.metadata ?? {},
    id: doc.id,
  });
}
