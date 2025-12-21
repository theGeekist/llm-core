import { Document } from "@langchain/core/documents";
import type { BaseDocumentTransformer } from "@langchain/core/documents";
import type { AdapterDocument, AdapterDocumentTransformer } from "../types";
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

export function fromLangChainTransformer(
  transformer: BaseDocumentTransformer,
): AdapterDocumentTransformer {
  function transform(documents: AdapterDocument[]) {
    const langchainDocs = toLangChainDocuments(documents);
    return mapMaybeArray(transformer.transformDocuments(langchainDocs), (doc) => ({
      id: doc.id,
      text: doc.pageContent,
      metadata: doc.metadata,
    }));
  }

  return { transform };
}
