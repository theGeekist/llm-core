import type { AdapterCallContext, Document, Retriever, RetrievalResult } from "../types";
import { toQueryText } from "../retrieval-query";
import { reportDiagnostics, validateRetrieverInput } from "../input-validation";

const scoreDocument = (text: string, query: string) => {
  if (!query) {
    return 0;
  }
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  return haystack.includes(needle) ? 1 : 0;
};

const toSnippet = (text: string) => text.slice(0, 160);

export const createBuiltinRetriever = (documents: Document[] = []): Retriever => ({
  retrieve(query, context?: AdapterCallContext) {
    const diagnostics = validateRetrieverInput(query);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return { query, documents: [] };
    }
    const queryText = toQueryText(query ?? "");
    const scored = documents.map((doc) => ({
      ...doc,
      score: doc.score ?? scoreDocument(doc.text, queryText),
    }));
    const sorted = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const citations = sorted.map((doc) => ({
      id: doc.id,
      text: toSnippet(doc.text),
      source: doc.metadata?.source ? String(doc.metadata.source) : undefined,
    }));
    const result: RetrievalResult = {
      query,
      documents: sorted,
      citations,
    };
    return result;
  },
});
