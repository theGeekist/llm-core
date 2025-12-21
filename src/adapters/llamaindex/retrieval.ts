import type { NodeWithScore } from "@llamaindex/core/schema";
import type { AdapterRetrievalQuery, AdapterRetrievalResult } from "../types";
import { fromLlamaIndexNode } from "./documents";

export function fromLlamaIndexNodes(
  nodes: NodeWithScore[],
  query?: AdapterRetrievalQuery,
): AdapterRetrievalResult {
  return {
    query,
    documents: nodes.map((entry) => ({
      ...fromLlamaIndexNode(entry.node),
      score: entry.score,
    })),
  };
}
