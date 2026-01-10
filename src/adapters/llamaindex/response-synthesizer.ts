import type { BaseSynthesizer } from "@llamaindex/core/response-synthesizers";
import type {
  AdapterCallContext,
  QueryResult,
  ResponseSynthesizer,
  SynthesisInput,
} from "../types";
import { bindFirst } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import { reportDiagnostics, validateResponseSynthesizerInput } from "../input-validation";
import {
  toLlamaIndexNodes,
  toLlamaIndexQueryType,
  toQueryDiagnosticStreamEvents,
  toQueryResult,
  toQueryStreamEvents,
} from "./engine-utils";

type SynthesizerDeps = {
  synthesizer: BaseSynthesizer;
};

function emptyResult(input: SynthesisInput, diagnostics: QueryResult["diagnostics"]): QueryResult {
  return { query: input.query, text: "", sources: input.documents, diagnostics };
}

function mapSynthesisResponse(
  input: SynthesisInput,
  response: Parameters<typeof toQueryResult>[2],
) {
  return toQueryResult(input.query, input.documents, response);
}

function mapSynthesisStream(
  input: SynthesisInput,
  stream: AsyncIterable<Parameters<typeof toQueryResult>[2]>,
) {
  return toQueryStreamEvents(input.query, input.documents, stream);
}

export function fromLlamaIndexResponseSynthesizer(
  synthesizer: BaseSynthesizer,
): ResponseSynthesizer {
  const deps: SynthesizerDeps = { synthesizer };
  return {
    synthesize: bindFirst(synthesizeWithDeps, deps),
    stream: bindFirst(streamWithDeps, deps),
  };
}

function synthesizeWithDeps(
  deps: SynthesizerDeps,
  input: SynthesisInput,
  context?: AdapterCallContext,
) {
  const diagnostics = validateResponseSynthesizerInput(input.query, input.documents);
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return emptyResult(input, diagnostics);
  }
  const queryType = toLlamaIndexQueryType(input.query);
  const nodes = toLlamaIndexNodes(input.documents);
  return maybeMap(
    bindFirst(mapSynthesisResponse, input),
    deps.synthesizer.synthesize({ query: queryType, nodes }),
  );
}

function streamWithDeps(
  deps: SynthesizerDeps,
  input: SynthesisInput,
  context?: AdapterCallContext,
) {
  const diagnostics = validateResponseSynthesizerInput(input.query, input.documents);
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return toQueryDiagnosticStreamEvents(diagnostics, input.documents);
  }
  const queryType = toLlamaIndexQueryType(input.query);
  const nodes = toLlamaIndexNodes(input.documents);
  return maybeMap(
    bindFirst(mapSynthesisStream, input),
    deps.synthesizer.synthesize({ query: queryType, nodes }, true),
  );
}
