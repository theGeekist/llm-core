import type { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { RecordManagerInterface } from "@langchain/core/indexing";
import { index as runLangChainIndex } from "@langchain/core/indexing";
import type { BaseRetrieverInterface } from "@langchain/core/retrievers";
import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import {
  Comparison,
  Operation,
  StructuredQuery as LangChainStructuredQuery,
  type FilterDirective,
} from "@langchain/core/structured_query";
import type { VectorStore as LangChainVectorStore } from "@langchain/core/vectorstores";
import type { TextSplitter as LangChainTextSplitter } from "@langchain/textsplitters";
import { maybeAll, maybeChain, maybeMap, maybeMapArray } from "#shared/maybe";
import type {
  Document,
  DocumentChunk,
  DocumentLoader,
  Embedder,
  Reranker,
  Retriever,
  StructuredQuery,
  StructuredQueryFilter,
  StructuredQueryValue,
  TextSplitter,
} from "../../../../features/retrieval/public";
import {
  documentText,
  retrievalQueryText,
  textDocument,
} from "../../../../features/retrieval/public";
import type {
  Indexer,
  IndexingOptions,
  IndexingResult,
  VectorRecord,
  VectorStore,
  VectorStoreDeleteRequest,
  VectorStoreUpsertRequest,
} from "../../../../features/indexing/public";

type PortableMetadata = NonNullable<Document["metadata"]>;

const isJsonValue = (value: unknown): boolean => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value).every(isJsonValue)
  );
};

const jsonObject = (value: unknown): PortableMetadata | undefined =>
  isJsonValue(value) && !Array.isArray(value) && value !== null && typeof value === "object"
    ? (value as PortableMetadata)
    : undefined;

const requireNonBlank = (value: string, operation: string) => {
  if (value.trim().length === 0) throw new TypeError(`${operation} requires non-blank text.`);
};

export function fromLangChainDocument(document: LangChainDocument): Document {
  return textDocument(document.pageContent, {
    id: document.id,
    metadata: jsonObject(document.metadata),
  });
}

export function toLangChainDocument(document: Document): LangChainDocument {
  return new LangChainDocument({
    pageContent: documentText(document),
    metadata: document.metadata ?? {},
    id: document.id,
  });
}

export const fromLangChainDocuments = (documents: LangChainDocument[]) =>
  documents.map(fromLangChainDocument);

export function createLangChainDocumentLoader(loader: BaseDocumentLoader): DocumentLoader {
  return { load: () => maybeMapArray(fromLangChainDocument, loader.load()) };
}

export function createLangChainEmbedder(embeddings: EmbeddingsInterface<number[]>): Embedder {
  return {
    embed: ({ text }) => {
      requireNonBlank(text, "Embedding");
      return embeddings.embedQuery(text);
    },
    embedMany: ({ texts }) => {
      if (texts.length === 0) throw new TypeError("Batch embedding requires text.");
      texts.forEach((text) => requireNonBlank(text, "Batch embedding"));
      return embeddings.embedDocuments(texts);
    },
  };
}

const toChunks = (documents: LangChainDocument[]): DocumentChunk[] =>
  documents.map((document) => ({
    content: [{ kind: "text", text: document.pageContent }],
    metadata: jsonObject(document.metadata),
  }));

export function createLangChainTextSplitter(splitter: LangChainTextSplitter): TextSplitter {
  return {
    split: ({ text }) => {
      requireNonBlank(text, "Text splitting");
      return splitter.splitText(text);
    },
    splitBatch: ({ texts }) => {
      if (texts.length === 0) throw new TypeError("Batch text splitting requires text.");
      texts.forEach((text) => requireNonBlank(text, "Batch text splitting"));
      return maybeAll(texts.map((text) => splitter.splitText(text)));
    },
    splitWithMetadata: ({ text }) => {
      requireNonBlank(text, "Text splitting");
      return maybeMap(toChunks, splitter.createDocuments([text], [{ source: "langchain" }]));
    },
  };
}

export function createLangChainRetriever(retriever: BaseRetrieverInterface): Retriever {
  return {
    retrieve: ({ query }) => {
      const text = retrievalQueryText(query);
      requireNonBlank(text, "Retrieval");
      return maybeMap(
        (documents) => ({ query, documents: fromLangChainDocuments(documents) }),
        retriever.invoke(text),
      );
    },
  };
}

export function createLangChainReranker(compressor: BaseDocumentCompressor): Reranker {
  return {
    rerank: ({ query, documents }) => {
      if (documents.length === 0) throw new TypeError("Reranking requires documents.");
      const text = retrievalQueryText(query);
      requireNonBlank(text, "Reranking");
      return maybeMapArray(
        fromLangChainDocument,
        compressor.compressDocuments(documents.map(toLangChainDocument), text),
      );
    },
  };
}

const structuredValue = (value: unknown): StructuredQueryValue =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : "";

function filterDirective(directive: FilterDirective): StructuredQueryFilter | null {
  if (directive instanceof Comparison) {
    return {
      kind: "comparison",
      comparator: directive.comparator,
      attribute: directive.attribute,
      value: structuredValue(directive.value),
    };
  }
  if (directive instanceof Operation) {
    return {
      kind: "operation",
      operator: directive.operator,
      filters: (directive.args ?? [])
        .map(filterDirective)
        .filter((item): item is StructuredQueryFilter => item !== null),
    };
  }
  return null;
}

export const fromLangChainStructuredQuery = (query: LangChainStructuredQuery): StructuredQuery => {
  const filter = query.filter ? filterDirective(query.filter) : null;
  return { query: query.query, ...(filter ? { filter } : {}) };
};

const namespaceOptions = (namespace?: string) => (namespace ? { namespace } : undefined);

const vectorDocument = (record: VectorRecord) =>
  record.document
    ? toLangChainDocument(record.document)
    : new LangChainDocument({
        pageContent: "",
        metadata: record.metadata ?? {},
        id: record.id,
      });

export function createLangChainVectorStore(store: LangChainVectorStore): VectorStore {
  return {
    upsert: (request: VectorStoreUpsertRequest) => {
      if ("documents" in request) {
        if (request.documents.length === 0) {
          throw new TypeError("Vector upsert requires documents.");
        }
        return maybeMap(
          (ids) => ({ ids: Array.isArray(ids) ? (ids as string[]) : undefined }),
          store.addDocuments(
            request.documents.map(toLangChainDocument),
            namespaceOptions(request.namespace),
          ),
        );
      }
      if (request.vectors.length === 0) {
        throw new TypeError("Vector upsert requires vectors.");
      }
      return maybeMap(
        (ids) => ({ ids: Array.isArray(ids) ? (ids as string[]) : undefined }),
        store.addVectors(
          request.vectors.map((record) => record.values),
          request.vectors.map(vectorDocument),
          namespaceOptions(request.namespace),
        ),
      );
    },
    delete: (request: VectorStoreDeleteRequest) => {
      const options =
        "ids" in request
          ? { ids: request.ids, ...(request.namespace ? { namespace: request.namespace } : {}) }
          : {
              filter: request.filter,
              ...(request.namespace ? { namespace: request.namespace } : {}),
            };
      if (("ids" in request && request.ids.length === 0) || Object.keys(options).length === 0) {
        throw new TypeError("Vector delete requires ids or a filter.");
      }
      return maybeMap(() => true, store.delete(options));
    },
  };
}

export interface LangChainIndexerInput {
  recordManager: RecordManagerInterface;
  vectorStore: LangChainVectorStore;
}

const mapIndexResult = (result: {
  numAdded: number;
  numDeleted: number;
  numUpdated: number;
  numSkipped: number;
}): IndexingResult => ({
  added: result.numAdded,
  deleted: result.numDeleted,
  updated: result.numUpdated,
  skipped: result.numSkipped,
});

const executeIndex = (
  input: LangChainIndexerInput,
  documents: Document[],
  options: IndexingOptions | undefined,
) =>
  maybeMap(
    mapIndexResult,
    runLangChainIndex({
      docsSource: documents.map(toLangChainDocument),
      recordManager: input.recordManager,
      vectorStore: input.vectorStore,
      options,
    }),
  );

export function createLangChainIndexer(input: LangChainIndexerInput): Indexer {
  return {
    index: ({ documents, options }) => {
      if (documents.length === 0) throw new TypeError("Indexing requires documents.");
      return maybeChain(
        () => executeIndex(input, documents, options),
        input.recordManager.createSchema(),
      );
    },
  };
}
