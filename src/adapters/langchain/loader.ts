import type { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import type { DocumentLoader } from "../types";
import { mapMaybeArray } from "../../maybe";

export function fromLangChainLoader(loader: BaseDocumentLoader): DocumentLoader {
  function load() {
    return mapMaybeArray(loader.load(), (doc) => ({
      id: doc.id,
      text: doc.pageContent,
      metadata: doc.metadata,
    }));
  }

  return { load };
}
