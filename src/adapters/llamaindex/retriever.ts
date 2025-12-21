import type { BaseRetriever } from "@llamaindex/core/retriever";
import { MetadataMode, type BaseNode, type NodeWithScore } from "@llamaindex/core/schema";
import type { AdapterRetrievalQuery, AdapterRetriever } from "../types";
import { mapMaybe } from "../maybe";

const toText = (query: AdapterRetrievalQuery) => String(query);

const getNodeText = (node: BaseNode) => {
  if ("getText" in node && typeof node.getText === "function") {
    return node.getText();
  }
  return node.getContent(MetadataMode.NONE);
};

function toDocuments(nodes: NodeWithScore[]) {
  return nodes.map((entry) => ({
    id: entry.node.id_,
    text: getNodeText(entry.node),
    metadata: entry.node.metadata,
    score: entry.score,
  }));
}

export function fromLlamaIndexRetriever(retriever: BaseRetriever): AdapterRetriever {
  function retrieve(query: AdapterRetrievalQuery) {
    const textQuery = toText(query);
    return mapMaybe(retriever.retrieve(textQuery), (nodes) => ({
      query,
      documents: toDocuments(nodes as NodeWithScore[]),
    }));
  }

  return { retrieve };
}
