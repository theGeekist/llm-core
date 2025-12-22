import type { AdapterDocument, AdapterRetriever, AdapterRetrievalResult } from "../types";
import { toQueryText } from "../retrieval-query";

const scoreDocument = (text: string, query: string) => {
  if (!query) {
    return 0;
  }
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  return haystack.includes(needle) ? 1 : 0;
};

const toSnippet = (text: string) => text.slice(0, 160);

export const createBuiltinRetriever = (documents: AdapterDocument[] = []): AdapterRetriever => ({
  retrieve(query) {
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
    const result: AdapterRetrievalResult = {
      query,
      documents: sorted,
      citations,
    };
    return result;
  },
});
