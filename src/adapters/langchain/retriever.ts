import type { BaseRetrieverInterface } from "@langchain/core/retrievers";
import type { AdapterRetrievalQuery, AdapterRetriever } from "../types";
import { mapMaybe } from "../../maybe";
import { fromLangChainDocuments } from "./retrieval";
import { toQueryText } from "../retrieval-query";

export function fromLangChainRetriever(retriever: BaseRetrieverInterface): AdapterRetriever {
  function retrieve(query: AdapterRetrievalQuery) {
    const textQuery = toQueryText(query);
    return mapMaybe(retriever.invoke(textQuery), (documents) =>
      fromLangChainDocuments(documents, query),
    );
  }

  return { retrieve };
}
