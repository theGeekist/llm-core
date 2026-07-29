import type { JsonObject, PortableContent, ResourceRef, SchemaRef } from "#contracts";

/**
 * A storage-neutral unit of knowledge.
 *
 * Content is the closed portable content union. Physical locators and native
 * document handles belong at adapter boundaries, never in this contract.
 */
export interface Document {
  id?: string;
  content: PortableContent[];
  metadata?: JsonObject;
  score?: number;
  resource?: ResourceRef;
  schema?: SchemaRef;
}

export interface DocumentChunk {
  content: PortableContent[];
  metadata?: JsonObject;
}

export const textDocument = (text: string, options: Omit<Document, "content"> = {}): Document => ({
  ...options,
  content: [{ kind: "text", text }],
});

export const documentText = (document: Pick<Document, "content">): string =>
  document.content
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.kind === "json") return JSON.stringify(part.value);
      if (part.kind === "media-ref" && part.altText !== undefined) return part.altText;
      throw new TypeError(
        `Text-only retrieval adapters cannot project ${part.kind} content without semantic loss.`,
      );
    })
    .join("");
