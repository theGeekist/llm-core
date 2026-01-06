import type { NodeParser } from "@llamaindex/core/node-parser";
import type { AdapterCallContext, Document, DocumentTransformer } from "../types";
import { maybeMapArray } from "../../shared/maybe";
import { toLlamaIndexDocument } from "./documents";
import { reportDiagnostics, validateTransformerInput } from "../input-validation";

export function fromLlamaIndexTransformer(parser: NodeParser): DocumentTransformer {
  function transform(documents: Document[], context?: AdapterCallContext) {
    const diagnostics = validateTransformerInput(documents);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    const nodes = parser.getNodesFromDocuments(documents.map(toLlamaIndexDocument));
    return maybeMapArray(
      (node) => ({
        id: node.id_,
        text: node.text ?? "",
        metadata: node.metadata,
      }),
      nodes,
    );
  }

  return { transform };
}
