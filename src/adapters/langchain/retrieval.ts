import type { Document as LangChainDocument } from "@langchain/core/documents";
import type { AdapterRetrievalQuery, AdapterRetrievalResult } from "../types";
import { fromLangChainDocument } from "./documents";

export function fromLangChainDocuments(
  documents: LangChainDocument[],
  query?: AdapterRetrievalQuery,
): AdapterRetrievalResult {
  return {
    query,
    documents: documents.map(fromLangChainDocument),
  };
}
