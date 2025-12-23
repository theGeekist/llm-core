import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { AdapterCallContext, Document, Reranker, RetrievalQuery } from "../types";
import { mapMaybeArray } from "../../maybe";
import { toQueryText } from "../retrieval-query";
import { toLangChainDocument } from "./documents";
import { reportDiagnostics, validateRerankerInput } from "../input-validation";

export function fromLangChainReranker(compressor: BaseDocumentCompressor): Reranker {
  function rerank(query: RetrievalQuery, documents: Document[], context?: AdapterCallContext) {
    const diagnostics = validateRerankerInput(query, documents);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    const langchainDocs = documents.map(toLangChainDocument);
    return mapMaybeArray(
      compressor.compressDocuments(langchainDocs, toQueryText(query)),
      (doc) => ({
        id: doc.id,
        text: doc.pageContent,
        metadata: doc.metadata,
      }),
    );
  }

  return {
    rerank,
    metadata: {
      requires: [{ kind: "construct", name: "retriever" }],
    },
  };
}
