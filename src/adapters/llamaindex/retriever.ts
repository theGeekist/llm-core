import type { BaseRetriever } from "@llamaindex/core/retriever";
import type { AdapterCallContext, RetrievalQuery, Retriever } from "../types";
import { maybeMap } from "#shared/maybe";
import { fromLlamaIndexNodes } from "./retrieval";
import { toQueryText } from "../retrieval-query";
import { reportDiagnostics, validateRetrieverInput } from "../input-validation";

export function fromLlamaIndexRetriever(retriever: BaseRetriever): Retriever {
  function retrieve(query: RetrievalQuery, context?: AdapterCallContext) {
    const diagnostics = validateRetrieverInput(query);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return { query, documents: [] };
    }
    const textQuery = toQueryText(query);
    return maybeMap((nodes) => fromLlamaIndexNodes(nodes, query), retriever.retrieve(textQuery));
  }

  return { retrieve };
}
