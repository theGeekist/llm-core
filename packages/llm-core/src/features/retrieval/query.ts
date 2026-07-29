import type { JsonValue, NativeExtensions, PortableContent, ResourceRef } from "#contracts";
import type { Document } from "./document";

export interface RetrievalQuery {
  content: PortableContent[];
}

export const textRetrievalQuery = (text: string): RetrievalQuery => ({
  content: [{ kind: "text", text }],
});

export const retrievalQueryText = (query: RetrievalQuery): string =>
  query.content
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.kind === "json") return JSON.stringify(part.value);
      if (part.kind === "media-ref" && part.altText !== undefined) return part.altText;
      throw new TypeError(
        `Text-only retrieval adapters cannot project ${part.kind} content without semantic loss.`,
      );
    })
    .join("");

export interface Citation {
  id?: string;
  content?: PortableContent[];
  resource?: ResourceRef;
}

export interface RetrievalResult {
  query?: RetrievalQuery;
  documents: Document[];
  citations?: Citation[];
  extensions?: NativeExtensions;
}

export type StructuredQueryOperator = "and" | "or" | "not";
export type StructuredQueryComparator = "eq" | "ne" | "lt" | "gt" | "lte" | "gte";
export type StructuredQueryValue = boolean | number | string;

export interface StructuredQueryComparison {
  kind: "comparison";
  comparator: StructuredQueryComparator;
  attribute: string;
  value: StructuredQueryValue;
}

export interface StructuredQueryOperation {
  kind: "operation";
  operator: StructuredQueryOperator;
  filters: StructuredQueryFilter[];
}

export type StructuredQueryFilter = StructuredQueryComparison | StructuredQueryOperation;

export interface StructuredQuery {
  query: string;
  filter?: StructuredQueryFilter;
}

export interface QueryDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
  data?: JsonValue;
}

export interface QueryResult {
  query?: RetrievalQuery;
  content: PortableContent[];
  sources?: Document[];
  diagnostics?: QueryDiagnostic[];
  extensions?: NativeExtensions;
}

export type QueryStreamEvent =
  | { kind: "start" }
  | { kind: "delta"; content: PortableContent[]; sources?: Document[] }
  | { kind: "end"; result: QueryResult }
  | { kind: "error"; error: QueryDiagnostic };
