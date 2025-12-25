import type { RerankingModelV3 } from "@ai-sdk/provider";
import type { AdapterCallContext, Document, Reranker, RetrievalQuery } from "../types";
import { toQueryText } from "../retrieval-query";
import { fromPromiseLike, mapMaybe } from "../../maybe";
import { reportDiagnostics, validateRerankerInput } from "../input-validation";

type RerankResult = Awaited<ReturnType<RerankingModelV3["doRerank"]>>;

const mapRanking = (documents: Document[], ranking: RerankResult["ranking"]) =>
  ranking.reduce<Document[]>((ranked, entry) => {
    const document = documents[entry.index];
    if (!document) {
      return ranked;
    }
    ranked.push({ ...document, score: entry.relevanceScore });
    return ranked;
  }, []);

export function fromAiSdkReranker(model: RerankingModelV3): Reranker {
  function rerank(query: RetrievalQuery, documents: Document[], context?: AdapterCallContext) {
    const diagnostics = validateRerankerInput(query, documents);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    const textQuery = toQueryText(query);
    const rerankResult = fromPromiseLike(
      model.doRerank({
        query: textQuery,
        documents: { type: "text", values: documents.map((document) => document.text) },
      }),
    );
    return mapMaybe(rerankResult, (result) => mapRanking(documents, result.ranking));
  }

  return { rerank };
}
