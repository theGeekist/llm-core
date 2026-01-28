import type { NodeWithScore } from "@llamaindex/core/schema";
import type { RetrievalQuery, RetrievalResult } from "../types";
import { fromLlamaIndexNode } from "./documents";

export function fromLlamaIndexNodes(
  nodes: NodeWithScore[],
  query?: RetrievalQuery,
): RetrievalResult {
  return {
    query,
    documents: nodes.map((entry) => ({
      ...fromLlamaIndexNode(entry.node),
      score: entry.score,
    })),
  };
}
