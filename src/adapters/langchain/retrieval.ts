import type { Document as LangChainDocument } from "@langchain/core/documents";
import type { RetrievalQuery, RetrievalResult } from "../types";
import { fromLangChainDocument } from "./documents";

export function fromLangChainDocuments(
  documents: LangChainDocument[],
  query?: RetrievalQuery,
): RetrievalResult {
  return {
    query,
    documents: documents.map(fromLangChainDocument),
  };
}
