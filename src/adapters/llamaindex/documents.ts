import { Document as LlamaDocument, MetadataMode, type BaseNode } from "@llamaindex/core/schema";
import type { AdapterDocument } from "../types";

export function fromLlamaIndexDocument(doc: LlamaDocument): AdapterDocument {
  return {
    id: doc.id_,
    text: doc.text,
    metadata: doc.metadata,
  };
}

export function toLlamaIndexDocument(doc: AdapterDocument): LlamaDocument {
  return new LlamaDocument({
    text: doc.text,
    metadata: doc.metadata,
    id_: doc.id,
  });
}

export function fromLlamaIndexNode(node: BaseNode): AdapterDocument {
  return {
    id: node.id_,
    text: node.getContent(MetadataMode.NONE),
    metadata: node.metadata,
  };
}
