import type { BaseRetrieverInterface } from "@langchain/core/retrievers";
import type { AdapterRequest, RetrievalQuery, Retriever } from "../types";
import { maybeMap } from "#shared/maybe";
import { fromLangChainDocuments } from "./retrieval";
import { toQueryText } from "../retrieval-query";
import { reportDiagnostics, validateRetrieverInput } from "../input-validation";

export function fromLangChainRetriever(retriever: BaseRetrieverInterface): Retriever {
  function retrieve({ query, context }: AdapterRequest<{ query: RetrievalQuery }>) {
    const diagnostics = validateRetrieverInput(query);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return { query, documents: [] };
    }
    const textQuery = toQueryText(query);
    return maybeMap(
      (documents) => fromLangChainDocuments(documents, query),
      retriever.invoke(textQuery),
    );
  }

  return { retrieve };
}
