import type { NodeParser } from "@llamaindex/core/node-parser";
import type { AdapterDocument, AdapterDocumentTransformer } from "../types";
import { mapMaybeArray } from "../maybe";
import { toLlamaIndexDocument } from "./documents";

export function fromLlamaIndexTransformer(parser: NodeParser): AdapterDocumentTransformer {
  function transform(documents: AdapterDocument[]) {
    const nodes = parser.getNodesFromDocuments(documents.map(toLlamaIndexDocument));
    return mapMaybeArray(nodes, (node) => ({
      id: node.id_,
      text: node.text ?? "",
      metadata: node.metadata,
    }));
  }

  return { transform };
}
