import type { BaseRetriever } from "@llamaindex/core/retriever";
import type { AdapterRetrievalQuery, AdapterRetriever } from "../types";
import { mapMaybe } from "../../maybe";
import { fromLlamaIndexNodes } from "./retrieval";
import { toQueryText } from "../retrieval-query";

export function fromLlamaIndexRetriever(retriever: BaseRetriever): AdapterRetriever {
  function retrieve(query: AdapterRetrievalQuery) {
    const textQuery = toQueryText(query);
    return mapMaybe(retriever.retrieve(textQuery), (nodes) => fromLlamaIndexNodes(nodes, query));
  }

  return { retrieve };
}
