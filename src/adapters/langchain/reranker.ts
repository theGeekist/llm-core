import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import { Document } from "@langchain/core/documents";
import type { AdapterDocument, AdapterReranker, AdapterRetrievalQuery } from "../types";
import { mapMaybeArray } from "../maybe";

const toLangChainDocuments = (documents: AdapterDocument[]) =>
  documents.map(
    (doc) =>
      new Document({
        pageContent: doc.text,
        metadata: doc.metadata,
        id: doc.id,
      }),
  );

export function fromLangChainReranker(compressor: BaseDocumentCompressor): AdapterReranker {
  function rerank(query: AdapterRetrievalQuery, documents: AdapterDocument[]) {
    const langchainDocs = toLangChainDocuments(documents);
    return mapMaybeArray(compressor.compressDocuments(langchainDocs, String(query)), (doc) => ({
      id: doc.id,
      text: doc.pageContent,
      metadata: doc.metadata,
    }));
  }

  return { rerank };
}
