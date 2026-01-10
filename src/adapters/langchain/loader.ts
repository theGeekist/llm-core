import type { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import type { DocumentLoader } from "../types";
import { maybeMapArray } from "#shared/maybe";

export function fromLangChainLoader(loader: BaseDocumentLoader): DocumentLoader {
  function load() {
    return maybeMapArray(
      (doc) => ({
        id: doc.id,
        text: doc.pageContent,
        metadata: doc.metadata,
      }),
      loader.load(),
    );
  }

  return { load };
}
