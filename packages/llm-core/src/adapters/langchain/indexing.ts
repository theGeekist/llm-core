import type { RecordManagerInterface } from "@langchain/core/indexing";
import { index as runIndex } from "@langchain/core/indexing";
import type { VectorStore as LangChainVectorStore } from "@langchain/core/vectorstores";
import type { AdapterRequest, Document, Indexing, IndexingInput, IndexingResult } from "../types";
import { bindFirst } from "#shared/fp";
import { maybeChain, maybeMap } from "#shared/maybe";
import { reportDiagnostics, validateIndexingInput } from "../input-validation";
import { toLangChainDocument } from "./documents";

type IndexingDeps = {
  recordManager: RecordManagerInterface;
  vectorStore: LangChainVectorStore;
  options: IndexingInput["options"];
};

function emptyResult(): IndexingResult {
  return { added: 0, deleted: 0, updated: 0, skipped: 0 };
}

function toLangChainDocs(documents: Document[]) {
  return documents.map(toLangChainDocument);
}

function mapIndexingResult(result: {
  numAdded: number;
  numDeleted: number;
  numUpdated: number;
  numSkipped: number;
}): IndexingResult {
  return {
    added: result.numAdded,
    deleted: result.numDeleted,
    updated: result.numUpdated,
    skipped: result.numSkipped,
  };
}

function readDocuments(request: AdapterRequest<IndexingInput>) {
  if (request.documents) {
    return request.documents;
  }
  if (request.loader) {
    return request.loader.load({ context: request.context });
  }
  return [];
}

function runIndexing(deps: IndexingDeps, documents: Document[]) {
  const langchainDocs = toLangChainDocs(documents);
  return maybeMap(
    mapIndexingResult,
    runIndex({
      docsSource: langchainDocs,
      recordManager: deps.recordManager,
      vectorStore: deps.vectorStore,
      options: deps.options,
    }),
  );
}

function runIndexAfterSchema(deps: IndexingDeps, documents: Document[], _value: unknown) {
  void _value;
  return runIndexing(deps, documents);
}

function runSchemaThenIndex(deps: IndexingDeps, documents: Document[]) {
  const withDeps = bindFirst(runIndexAfterSchema, deps);
  const withDocuments = bindFirst(withDeps, documents);
  return maybeChain(withDocuments, deps.recordManager.createSchema());
}

export function fromLangChainIndexing(
  recordManager: RecordManagerInterface,
  vectorStore: LangChainVectorStore,
): Indexing {
  const deps: IndexingDeps = { recordManager, vectorStore, options: undefined };
  return { index: bindFirst(indexWithDeps, deps) };
}

function indexWithDeps(deps: IndexingDeps, request: AdapterRequest<IndexingInput>) {
  const diagnostics = validateIndexingInput(request);
  if (diagnostics.length > 0) {
    reportDiagnostics(request.context, diagnostics);
    return emptyResult();
  }
  const withOptions: IndexingDeps = {
    ...deps,
    options: request.options,
  };
  return maybeChain(bindFirst(runSchemaThenIndex, withOptions), readDocuments(request));
}
