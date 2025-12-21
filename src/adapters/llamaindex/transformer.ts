import type { NodeParser } from "@llamaindex/core/node-parser";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import type { AdapterDocument, AdapterDocumentTransformer } from "../types";
import { mapMaybeArray } from "../maybe";

const toLlamaDocuments = (documents: AdapterDocument[]) =>
  documents.map((doc) => new LlamaDocument({ text: doc.text, metadata: doc.metadata }));

export function fromLlamaIndexTransformer(parser: NodeParser): AdapterDocumentTransformer {
  function transform(documents: AdapterDocument[]) {
    const nodes = parser.getNodesFromDocuments(toLlamaDocuments(documents));
    return mapMaybeArray(nodes, (node) => ({
      id: node.id_,
      text: node.text ?? "",
      metadata: node.metadata,
    }));
  }

  return { transform };
}
