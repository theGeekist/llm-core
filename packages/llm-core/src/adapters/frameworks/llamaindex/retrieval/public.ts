import type { BaseEmbedding } from "@llamaindex/core/embeddings";
import type {
  TextSplitter as LlamaIndexTextSplitter,
  NodeParser,
} from "@llamaindex/core/node-parser";
import type { BaseNodePostprocessor } from "@llamaindex/core/postprocessor";
import type { BaseQueryEngine, QueryType } from "@llamaindex/core/query-engine";
import type { BaseRetriever } from "@llamaindex/core/retriever";
import type { BaseSynthesizer } from "@llamaindex/core/response-synthesizers";
import {
  Document as LlamaDocument,
  MetadataMode,
  type BaseNode,
  type BaseReader,
  type EngineResponse,
  type NodeWithScore,
} from "@llamaindex/core/schema";
import type { BaseVectorStore } from "@llamaindex/core/vector-store";
import { maybeAll, maybeMap, maybeMapArray } from "#shared/maybe";
import type {
  Document,
  DocumentChunk,
  DocumentLoader,
  DocumentTransformer,
  Embedder,
  QueryDiagnostic,
  QueryEngine,
  QueryResult,
  QueryStreamEvent,
  Reranker,
  ResponseSynthesizer,
  RetrievalQuery,
  Retriever,
  SynthesisRequest,
  TextSplitter,
} from "../../../../features/retrieval/public";
import {
  documentText,
  retrievalQueryText,
  textDocument,
} from "../../../../features/retrieval/public";
import type {
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

export function fromLlamaIndexDocument(document: LlamaDocument): Document {
  return textDocument(document.text, {
    id: document.id_,
    metadata: jsonObject(document.metadata),
  });
}

export function fromLlamaIndexNode(node: BaseNode): Document {
  return textDocument(node.getContent(MetadataMode.NONE), {
    id: node.id_,
    metadata: jsonObject(node.metadata),
  });
}

export function toLlamaIndexDocument(document: Document): LlamaDocument {
  return new LlamaDocument({
    text: documentText(document),
    metadata: document.metadata,
    id_: document.id,
  });
}

export const fromLlamaIndexNodes = (nodes: NodeWithScore[]): Document[] =>
  nodes.map(({ node, score }) => ({ ...fromLlamaIndexNode(node), score }));

export function createLlamaIndexDocumentLoader(reader: BaseReader): DocumentLoader {
  return {
    load: () =>
      maybeMapArray(
        (document) =>
          textDocument(document.text ?? "", {
            id: document.id_,
            metadata: jsonObject(document.metadata),
          }),
        reader.loadData(),
      ),
  };
}

export function createLlamaIndexEmbedder(embedding: BaseEmbedding): Embedder {
  return {
    embed: ({ text }) => {
      requireNonBlank(text, "Embedding");
      return embedding.getTextEmbedding(text);
    },
    embedMany: ({ texts }) => {
      if (texts.length === 0) throw new TypeError("Batch embedding requires text.");
      texts.forEach((text) => requireNonBlank(text, "Batch embedding"));
      return embedding.getTextEmbeddings(texts);
    },
  };
}

const chunks = (values: string[]): DocumentChunk[] =>
  values.map((text) => ({ content: [{ kind: "text", text }] }));

export function createLlamaIndexTextSplitter(splitter: LlamaIndexTextSplitter): TextSplitter {
  return {
    split: ({ text }) => {
      requireNonBlank(text, "Text splitting");
      return splitter.splitText(text);
    },
    splitBatch: ({ texts }) => {
      if (texts.length === 0) throw new TypeError("Batch text splitting requires text.");
      texts.forEach((text) => requireNonBlank(text, "Batch text splitting"));
      return texts.map((text) => splitter.splitText(text));
    },
    splitWithMetadata: ({ text }) => {
      requireNonBlank(text, "Text splitting");
      return chunks(splitter.splitText(text));
    },
  };
}

export function createLlamaIndexDocumentTransformer(parser: NodeParser): DocumentTransformer {
  return {
    transform: (documents) => {
      if (documents.length === 0) throw new TypeError("Transformation requires documents.");
      return maybeMapArray(
        fromLlamaIndexNode,
        parser.getNodesFromDocuments(documents.map(toLlamaIndexDocument)),
      );
    },
  };
}

export function createLlamaIndexRetriever(retriever: BaseRetriever): Retriever {
  return {
    retrieve: ({ query }) => {
      const text = retrievalQueryText(query);
      requireNonBlank(text, "Retrieval");
      return maybeMap(
        (nodes) => ({ query, documents: fromLlamaIndexNodes(nodes) }),
        retriever.retrieve(text),
      );
    },
  };
}

const nodeText = (node: BaseNode) =>
  "getText" in node && typeof node.getText === "function"
    ? node.getText()
    : node.getContent(MetadataMode.NONE);

export function createLlamaIndexReranker(reranker: BaseNodePostprocessor): Reranker {
  return {
    rerank: ({ query, documents }) => {
      if (documents.length === 0) throw new TypeError("Reranking requires documents.");
      const text = retrievalQueryText(query);
      requireNonBlank(text, "Reranking");
      const nodes = documents.map((document) => ({
        node: toLlamaIndexDocument(document),
        score: document.score,
      }));
      return maybeMapArray(
        ({ node, score }) =>
          textDocument(nodeText(node), {
            id: node.id_,
            metadata: jsonObject(node.metadata),
            score,
          }),
        reranker.postprocessNodes(nodes, text),
      );
    },
  };
}

const vectorDocument = (record: VectorRecord) =>
  record.document
    ? toLlamaIndexDocument(record.document)
    : new LlamaDocument({ text: "", metadata: record.metadata, id_: record.id });

const embeddedNode = (record: VectorRecord) => {
  const node = vectorDocument(record);
  node.embedding = record.values;
  return node;
};

export function createLlamaIndexVectorStore(store: BaseVectorStore): VectorStore {
  return {
    upsert: (request: VectorStoreUpsertRequest) => {
      const nodes =
        "documents" in request
          ? request.documents.map(toLlamaIndexDocument)
          : request.vectors.map(embeddedNode);
      if (nodes.length === 0) throw new TypeError("Vector upsert requires values.");
      return maybeMap((ids) => ({ ids }), store.add(nodes));
    },
    delete: (request: VectorStoreDeleteRequest) => {
      if ("filter" in request) return null;
      if (request.ids.length === 0) throw new TypeError("Vector delete requires ids.");
      return maybeMap(() => true, maybeAll(request.ids.map((id) => store.delete(id))));
    },
  };
}

const queryType = (query: RetrievalQuery): QueryType => retrievalQueryText(query);

const responseText = (response: EngineResponse): string => {
  const content: unknown = response.message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const candidate = part as { text?: unknown };
      return typeof candidate.text === "string" ? candidate.text : "";
    })
    .join("");
};

const responseSources = (response: EngineResponse): Document[] | undefined =>
  response.sourceNodes?.length ? fromLlamaIndexNodes(response.sourceNodes) : undefined;

const nativeExtensions = (raw: unknown) => {
  const value = jsonObject(raw);
  return value ? { "org.llamaindex.response": value } : undefined;
};

const queryResult = (
  query: RetrievalQuery,
  response: EngineResponse,
  fallbackSources?: Document[],
): QueryResult => ({
  query,
  content: [{ kind: "text", text: responseText(response) }],
  sources: responseSources(response) ?? fallbackSources,
  extensions: nativeExtensions(response.raw),
});

const streamEvents = async function* (
  query: RetrievalQuery,
  stream: AsyncIterable<EngineResponse>,
  fallbackSources?: Document[],
): AsyncIterable<QueryStreamEvent> {
  let text = "";
  let sources = fallbackSources;
  let extensions: QueryResult["extensions"];
  yield { kind: "start" };
  try {
    for await (const response of stream) {
      const delta = response.delta ?? "";
      if (delta) {
        text += delta;
        yield { kind: "delta", content: [{ kind: "text", text: delta }] };
      }
      sources = responseSources(response) ?? sources;
      extensions = nativeExtensions(response.raw) ?? extensions;
    }
  } catch (error) {
    const diagnostic: QueryDiagnostic = {
      severity: "error",
      code: "llamaindex-stream-error",
      message: error instanceof Error ? error.message : "LlamaIndex stream failed.",
    };
    yield { kind: "error", error: diagnostic };
    return;
  }
  yield {
    kind: "end",
    result: {
      query,
      content: [{ kind: "text", text }],
      sources,
      extensions,
    },
  };
};

export function createLlamaIndexQueryEngine(engine: BaseQueryEngine): QueryEngine {
  return {
    query: ({ query }) => {
      const text = retrievalQueryText(query);
      requireNonBlank(text, "Query engine");
      return maybeMap(
        (response) => queryResult(query, response),
        engine.query({ query: queryType(query) }),
      );
    },
    stream: ({ query }) => {
      const text = retrievalQueryText(query);
      requireNonBlank(text, "Query engine");
      return maybeMap(
        (stream) => streamEvents(query, stream),
        engine.query({ query: queryType(query), stream: true }),
      );
    },
  };
}

function synthesize(
  synthesizer: BaseSynthesizer,
  request: SynthesisRequest,
  stream: true,
): Promise<AsyncIterable<EngineResponse>>;
function synthesize(
  synthesizer: BaseSynthesizer,
  request: SynthesisRequest,
  stream?: false,
): Promise<EngineResponse>;
function synthesize(synthesizer: BaseSynthesizer, request: SynthesisRequest, stream = false) {
  const nodes = request.documents.map((document) => ({
    node: toLlamaIndexDocument(document),
    score: document.score,
  }));
  return stream
    ? synthesizer.synthesize({ query: queryType(request.query), nodes }, true)
    : synthesizer.synthesize({ query: queryType(request.query), nodes }, false);
}

export function createLlamaIndexResponseSynthesizer(
  synthesizer: BaseSynthesizer,
): ResponseSynthesizer {
  return {
    synthesize: (request) => {
      if (request.documents.length === 0) {
        throw new TypeError("Response synthesis requires documents.");
      }
      requireNonBlank(retrievalQueryText(request.query), "Response synthesis");
      return maybeMap(
        (response) => queryResult(request.query, response, request.documents),
        synthesize(synthesizer, request),
      );
    },
    stream: (request) => {
      if (request.documents.length === 0) {
        throw new TypeError("Response synthesis requires documents.");
      }
      requireNonBlank(retrievalQueryText(request.query), "Response synthesis");
      return maybeMap(
        (stream) => streamEvents(request.query, stream, request.documents),
        synthesize(synthesizer, request, true),
      );
    },
  };
}
