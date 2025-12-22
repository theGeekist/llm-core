import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { AdapterDocument, AdapterReranker, AdapterRetrievalQuery } from "../types";
import { mapMaybeArray } from "../../maybe";
import { toQueryText } from "../retrieval-query";
import { toLangChainDocument } from "./documents";

export function fromLangChainReranker(compressor: BaseDocumentCompressor): AdapterReranker {
  function rerank(query: AdapterRetrievalQuery, documents: AdapterDocument[]) {
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

  return { rerank };
}
