import type { MessageContent as LlamaIndexContent } from "@llamaindex/core/llms";
import type { QueryType } from "@llamaindex/core/query-engine";
import type { EngineResponse, NodeWithScore } from "@llamaindex/core/schema";
import type {
  AdapterDiagnostic,
  Document,
  QueryResult,
  QueryStreamEvent,
  RetrievalQuery,
} from "../types";
import { toQueryText } from "../retrieval-query";
import { fromLlamaIndexMessage, toLlamaIndexMessageContent } from "./messages";
import { fromLlamaIndexNodes } from "./retrieval";
import { toLlamaIndexDocument } from "./documents";

export function toLlamaIndexQueryType(query: RetrievalQuery): QueryType {
  if (typeof query === "string") {
    return query;
  }
  const content: LlamaIndexContent = toLlamaIndexMessageContent(query);
  return { query: content };
}

function toNodeWithScore(doc: Document): NodeWithScore {
  return {
    node: toLlamaIndexDocument(doc),
    score: doc.score,
  };
}

export function toLlamaIndexNodes(documents: Document[]): NodeWithScore[] {
  return documents.map(toNodeWithScore);
}

export function readQueryResponseText(response: EngineResponse) {
  const message = fromLlamaIndexMessage(response.message);
  return toQueryText(message.content);
}

export function readQueryResponseSources(response: EngineResponse) {
  if (!response.sourceNodes || response.sourceNodes.length === 0) {
    return null;
  }
  return fromLlamaIndexNodes(response.sourceNodes).documents;
}

export function toQueryResult(
  query: RetrievalQuery | undefined,
  fallbackSources: Document[] | undefined,
  response: EngineResponse,
): QueryResult {
  const text = readQueryResponseText(response);
  const sources = readQueryResponseSources(response) ?? fallbackSources;
  return {
    query,
    text,
    sources,
    raw: response.raw,
  };
}

function readDelta(response: EngineResponse) {
  return response.delta ?? "";
}

export async function* toQueryStreamEvents(
  query: RetrievalQuery | undefined,
  fallbackSources: Document[] | undefined,
  stream: AsyncIterable<EngineResponse>,
): AsyncIterable<QueryStreamEvent> {
  let buffer = "";
  let lastResponse: EngineResponse | undefined;
  let lastSources = fallbackSources;
  yield { type: "start" };
  try {
    for await (const response of stream) {
      lastResponse = response;
      const delta = readDelta(response);
      if (delta) {
        buffer += delta;
        yield { type: "delta", text: delta, raw: response.raw };
      }
      const sources = readQueryResponseSources(response);
      if (sources) {
        lastSources = sources;
      }
    }
  } catch (error) {
    yield { type: "error", error };
    return;
  }
  yield {
    type: "end",
    text: buffer,
    sources: lastSources,
    raw: lastResponse?.raw,
  };
}

export async function* toQueryDiagnosticStreamEvents(
  diagnostics: AdapterDiagnostic[],
  sources: Document[] | undefined,
): AsyncIterable<QueryStreamEvent> {
  yield { type: "start" };
  yield {
    type: "end",
    text: "",
    sources,
    diagnostics,
  };
}
