import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { AdapterRequest, Document, Reranker, RetrievalQuery } from "../types";
import { maybeMapArray } from "#shared/maybe";
import { toQueryText } from "../retrieval-query";
import { toLangChainDocument } from "./documents";
import { reportDiagnostics, validateRerankerInput } from "../input-validation";

export function fromLangChainReranker(compressor: BaseDocumentCompressor): Reranker {
  function rerank({
    query,
    documents,
    context,
  }: AdapterRequest<{ query: RetrievalQuery; documents: Document[] }>) {
    const diagnostics = validateRerankerInput(query, documents);
    if (reportDiagnostics(context, diagnostics)) {
      return [];
    }
    const langchainDocs = documents.map(toLangChainDocument);
    return maybeMapArray(
      (doc) => ({
        id: doc.id,
        text: doc.pageContent,
        metadata: doc.metadata,
      }),
      compressor.compressDocuments(langchainDocs, toQueryText(query)),
    );
  }

  return {
    rerank,
    metadata: {
      requires: [{ kind: "construct", name: "retriever" }],
    },
  };
}
