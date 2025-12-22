import type { BaseDocumentTransformer } from "@langchain/core/documents";
import type { AdapterDocument, AdapterDocumentTransformer } from "../types";
import { mapMaybeArray } from "../../maybe";
import { toLangChainDocument } from "./documents";

export function fromLangChainTransformer(
  transformer: BaseDocumentTransformer,
): AdapterDocumentTransformer {
  function transform(documents: AdapterDocument[]) {
    const langchainDocs = documents.map(toLangChainDocument);
    return mapMaybeArray(transformer.transformDocuments(langchainDocs), (doc) => ({
      id: doc.id,
      text: doc.pageContent,
      metadata: doc.metadata,
    }));
  }

  return { transform };
}
