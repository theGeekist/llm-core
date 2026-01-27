import type { RecordManagerInterface } from "@langchain/core/indexing";
import { index as runIndex } from "@langchain/core/indexing";
import type { VectorStore as LangChainVectorStore } from "@langchain/core/vectorstores";
import type {
  AdapterCallContext,
  Document,
  Indexing,
  IndexingInput,
  IndexingResult,
} from "../types";
import { bindFirst } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
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

function readDocuments(input: IndexingInput) {
  if (input.documents) {
    return input.documents;
  }
  if (input.loader) {
    return input.loader.load();
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
  return maybeMap(withDocuments, deps.recordManager.createSchema());
}

export function fromLangChainIndexing(
  recordManager: RecordManagerInterface,
  vectorStore: LangChainVectorStore,
): Indexing {
  const deps: IndexingDeps = { recordManager, vectorStore, options: undefined };
  return { index: bindFirst(indexWithDeps, deps) };
}

function indexWithDeps(deps: IndexingDeps, input: IndexingInput, context?: AdapterCallContext) {
  const diagnostics = validateIndexingInput(input);
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return emptyResult();
  }
  const withOptions: IndexingDeps = {
    ...deps,
    options: input.options,
  };
  return maybeMap(bindFirst(runSchemaThenIndex, withOptions), readDocuments(input));
}
