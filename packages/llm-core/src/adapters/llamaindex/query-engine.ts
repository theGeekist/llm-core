import type { BaseQueryEngine } from "@llamaindex/core/query-engine";
import type { AdapterRequest, QueryEngine, QueryResult, RetrievalQuery } from "../types";
import { bindFirst } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import { reportDiagnostics, validateQueryEngineInput } from "../input-validation";
import {
  toLlamaIndexQueryType,
  toQueryDiagnosticStreamEvents,
  toQueryResult,
  toQueryStreamEvents,
} from "./engine-utils";

type QueryEngineDeps = {
  engine: BaseQueryEngine;
};

function emptyResult(query: RetrievalQuery, diagnostics: QueryResult["diagnostics"]): QueryResult {
  return { query, text: "", diagnostics };
}

function mapQueryResponse(query: RetrievalQuery, response: Parameters<typeof toQueryResult>[2]) {
  return toQueryResult(query, undefined, response);
}

function mapQueryStream(
  query: RetrievalQuery,
  stream: AsyncIterable<Parameters<typeof toQueryResult>[2]>,
) {
  return toQueryStreamEvents(query, undefined, stream);
}

export function fromLlamaIndexQueryEngine(engine: BaseQueryEngine): QueryEngine {
  const deps: QueryEngineDeps = { engine };
  return {
    query: bindFirst(queryWithDeps, deps),
    stream: bindFirst(streamWithDeps, deps),
  };
}

function queryWithDeps(
  deps: QueryEngineDeps,
  { query, context }: AdapterRequest<{ query: RetrievalQuery }>,
) {
  const diagnostics = validateQueryEngineInput(query);
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return emptyResult(query, diagnostics);
  }
  const queryType = toLlamaIndexQueryType(query);
  return maybeMap(bindFirst(mapQueryResponse, query), deps.engine.query({ query: queryType }));
}

function streamWithDeps(
  deps: QueryEngineDeps,
  { query, context }: AdapterRequest<{ query: RetrievalQuery }>,
) {
  const diagnostics = validateQueryEngineInput(query);
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return toQueryDiagnosticStreamEvents(diagnostics, undefined);
  }
  const queryType = toLlamaIndexQueryType(query);
  return maybeMap(
    bindFirst(mapQueryStream, query),
    deps.engine.query({ query: queryType, stream: true }),
  );
}
