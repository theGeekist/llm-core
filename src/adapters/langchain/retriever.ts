import type { BaseRetrieverInterface } from "@langchain/core/retrievers";
import type { AdapterCallContext, RetrievalQuery, Retriever } from "../types";
import { mapMaybe } from "../../maybe";
import { fromLangChainDocuments } from "./retrieval";
import { toQueryText } from "../retrieval-query";
import { reportDiagnostics, validateRetrieverInput } from "../input-validation";

export function fromLangChainRetriever(retriever: BaseRetrieverInterface): Retriever {
  function retrieve(query: RetrievalQuery, context?: AdapterCallContext) {
    const diagnostics = validateRetrieverInput(query);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return { query, documents: [] };
    }
    const textQuery = toQueryText(query);
    return mapMaybe(retriever.invoke(textQuery), (documents) =>
      fromLangChainDocuments(documents, query),
    );
  }

  return { retrieve };
}
