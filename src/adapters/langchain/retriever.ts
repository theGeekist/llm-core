import type { BaseRetrieverInterface } from "@langchain/core/retrievers";
import type { AdapterRetrievalQuery, AdapterRetriever } from "../types";
import { mapMaybe } from "../maybe";

type LangChainDocument = {
  pageContent: string;
  metadata: Record<string, unknown>;
  id?: string;
};

const toText = (query: AdapterRetrievalQuery) => String(query);

function toDocuments(documents: LangChainDocument[]) {
  return documents.map((doc) => ({
    id: doc.id,
    text: doc.pageContent,
    metadata: doc.metadata,
  }));
}

export function fromLangChainRetriever(retriever: BaseRetrieverInterface): AdapterRetriever {
  function retrieve(query: AdapterRetrievalQuery) {
    const textQuery = toText(query);
    return mapMaybe(retriever.invoke(textQuery), (documents) => ({
      query,
      documents: toDocuments(documents as LangChainDocument[]),
    }));
  }

  return { retrieve };
}
