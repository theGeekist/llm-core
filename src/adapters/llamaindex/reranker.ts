import type { BaseNodePostprocessor } from "@llamaindex/core/postprocessor";
import { MetadataMode, type BaseNode } from "@llamaindex/core/schema";
import type { AdapterCallContext, Document, Reranker, RetrievalQuery } from "../types";
import { maybeMapArray } from "../../maybe";
import { toQueryText } from "../retrieval-query";
import { toLlamaIndexDocument } from "./documents";
import { reportDiagnostics, validateRerankerInput } from "../input-validation";

const getNodeText = (node: BaseNode) => {
  if ("getText" in node && typeof node.getText === "function") {
    return node.getText();
  }
  return node.getContent(MetadataMode.NONE);
};

export function fromLlamaIndexReranker(reranker: BaseNodePostprocessor): Reranker {
  function rerank(query: RetrievalQuery, documents: Document[], context?: AdapterCallContext) {
    const diagnostics = validateRerankerInput(query, documents);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    const nodes = documents.map((doc) => ({
      node: toLlamaIndexDocument(doc),
      score: doc.score,
    }));
    return maybeMapArray(
      (entry) => ({
        id: entry.node.id_,
        text: getNodeText(entry.node),
        metadata: entry.node.metadata,
        score: entry.score,
      }),
      reranker.postprocessNodes(nodes, toQueryText(query)),
    );
  }

  return {
    rerank,
    metadata: {
      requires: [{ kind: "construct", name: "retriever" }],
    },
  };
}
