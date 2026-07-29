import type { BaseDocumentTransformer } from "@langchain/core/documents";
import type { AdapterRequest, Document, DocumentTransformer } from "../types";
import { maybeMapArray } from "#shared/maybe";
import { toLangChainDocument } from "./documents";
import { reportDiagnostics, validateTransformerInput } from "../input-validation";

export function fromLangChainTransformer(
  transformer: BaseDocumentTransformer,
): DocumentTransformer {
  function transform({ documents, context }: AdapterRequest<{ documents: Document[] }>) {
    const diagnostics = validateTransformerInput(documents);
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
      transformer.transformDocuments(langchainDocs),
    );
  }

  return { transform };
}
