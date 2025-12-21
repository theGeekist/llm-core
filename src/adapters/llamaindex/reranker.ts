import type { BaseNodePostprocessor } from "@llamaindex/core/postprocessor";
import { Document as LlamaDocument, MetadataMode, type BaseNode } from "@llamaindex/core/schema";
import type { AdapterDocument, AdapterReranker, AdapterRetrievalQuery } from "../types";
import { mapMaybeArray } from "../maybe";

const getNodeText = (node: BaseNode) => {
  if ("getText" in node && typeof node.getText === "function") {
    return node.getText();
  }
  return node.getContent(MetadataMode.NONE);
};

export function fromLlamaIndexReranker(reranker: BaseNodePostprocessor): AdapterReranker {
  function rerank(query: AdapterRetrievalQuery, documents: AdapterDocument[]) {
    const nodes = documents.map((doc) => ({
      node: new LlamaDocument({ text: doc.text, metadata: doc.metadata }),
      score: doc.score,
    }));
    return mapMaybeArray(reranker.postprocessNodes(nodes, String(query)), (entry) => ({
      id: entry.node.id_,
      text: getNodeText(entry.node),
      metadata: entry.node.metadata,
      score: entry.score,
    }));
  }

  return { rerank };
}
