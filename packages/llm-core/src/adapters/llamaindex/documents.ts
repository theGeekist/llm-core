import { Document as LlamaDocument, MetadataMode, type BaseNode } from "@llamaindex/core/schema";
import type { Document } from "../types";

export function fromLlamaIndexDocument(doc: LlamaDocument): Document {
  return {
    id: doc.id_,
    text: doc.text,
    metadata: doc.metadata,
  };
}

export function toLlamaIndexDocument(doc: Document): LlamaDocument {
  return new LlamaDocument({
    text: doc.text,
    metadata: doc.metadata,
    id_: doc.id,
  });
}

export function fromLlamaIndexNode(node: BaseNode): Document {
  return {
    id: node.id_,
    text: node.getContent(MetadataMode.NONE),
    metadata: node.metadata,
  };
}
