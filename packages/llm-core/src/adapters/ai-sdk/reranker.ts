import type { RerankingModelV3 } from "@ai-sdk/provider";
import type { AdapterCallContext, Document, Reranker, RetrievalQuery } from "../types";
import { toQueryText } from "../retrieval-query";
import { maybeMap } from "#shared/maybe";
import type { MaybePromise } from "#shared/maybe";
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
    const rerankResult = model.doRerank({
      query: textQuery,
      documents: { type: "text", values: documents.map((document) => document.text) },
    }) as MaybePromise<RerankResult>;
    return maybeMap((result) => mapRanking(documents, result.ranking), rerankResult);
  }

  return { rerank };
}
