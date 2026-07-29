import { describe, expect, test } from "bun:test";
import type { RerankingModelV3 } from "@ai-sdk/provider";
import type { RecordManagerInterface } from "@langchain/core/indexing";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { VectorStore as LangChainVectorStore } from "@langchain/core/vectorstores";
import type { BaseQueryEngine } from "@llamaindex/core/query-engine";
import type { BaseSynthesizer } from "@llamaindex/core/response-synthesizers";
import {
  Document as LlamaDocument,
  EngineResponse,
  type BaseReader,
} from "@llamaindex/core/schema";
import type { BaseVectorStore } from "@llamaindex/core/vector-store";
import type { EmbeddingModel } from "ai";
import { collectStep, isPromiseLike, maybeToStep, type MaybeAsyncIterable } from "#shared/maybe";
import {
  createAiSdkEmbedder,
  createAiSdkReranker,
} from "../../src/adapters/providers/ai-sdk/retrieval/public";
import {
  createLangChainDocumentLoader,
  createLangChainEmbedder,
  createLangChainIndexer,
  createLangChainReranker,
  createLangChainRetriever,
  createLangChainTextSplitter,
  createLangChainVectorStore,
} from "../../src/adapters/frameworks/langchain/retrieval/public";
import {
  createLlamaIndexDocumentLoader,
  createLlamaIndexDocumentTransformer,
  createLlamaIndexEmbedder,
  createLlamaIndexQueryEngine,
  createLlamaIndexReranker,
  createLlamaIndexResponseSynthesizer,
  createLlamaIndexRetriever,
  createLlamaIndexTextSplitter,
  createLlamaIndexVectorStore,
} from "../../src/adapters/frameworks/llamaindex/retrieval/public";
import type { QueryStreamEvent } from "../../src/features/retrieval/public";
import {
  documentText,
  textDocument,
  textRetrievalQuery,
} from "../../src/features/retrieval/public";

const CONTEXT = {
  invocationId: "0190bd0c-0000-7000-8000-000000001414" as never,
};

const collect = async (value: MaybeAsyncIterable<QueryStreamEvent>) => {
  const maybeStep = maybeToStep(value);
  const step = isPromiseLike(maybeStep) ? await maybeStep : maybeStep;
  const items = collectStep(step);
  return isPromiseLike(items) ? await items : items;
};

const rejectingStream = (message: string): AsyncIterable<EngineResponse> => ({
  [Symbol.asyncIterator]() {
    return {
      next: () => Promise.reject(new Error(message)),
    };
  },
});

describe("qualified adapter parity matrix", () => {
  test("AI SDK preserves embedding cardinality and ranking order", async () => {
    const embeddingModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "embedding",
      maxEmbeddingsPerCall: 100,
      supportsParallelCalls: true,
      doEmbed: async ({ values }: { values: string[] }) => ({
        embeddings: values.map((value) => [value.length]),
      }),
    } as unknown as EmbeddingModel;
    const embedder = createAiSdkEmbedder(embeddingModel);
    expect(await embedder.embed({ text: "one" }, CONTEXT)).toEqual([3]);
    expect(await embedder.embedMany?.({ texts: ["a", "four"] }, CONTEXT)).toEqual([[1], [4]]);

    const rerankingModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "reranking",
      doRerank: () =>
        Promise.resolve({
          ranking: [
            { index: 2, relevanceScore: 0.9 },
            { index: 0, relevanceScore: 0.5 },
          ],
        }),
    } as unknown as RerankingModelV3;
    const documents = [textDocument("zero"), textDocument("one"), textDocument("two")];
    const ranked = await createAiSdkReranker(rerankingModel).rerank(
      { query: textRetrievalQuery("q"), documents },
      CONTEXT,
    );
    expect(ranked.map(documentText)).toEqual(["two", "zero"]);
    expect(ranked.map((document) => document.score)).toEqual([0.9, 0.5]);
  });

  test("LangChain preserves loader, splitter, embedding, retrieval and reranking behavior", async () => {
    const loader = createLangChainDocumentLoader({
      load: () =>
        Promise.resolve([
          new LangChainDocument({ pageContent: "loaded-1" }),
          new LangChainDocument({ pageContent: "loaded-2" }),
        ]),
    } as never);
    expect((await loader.load(CONTEXT)).map(documentText)).toEqual(["loaded-1", "loaded-2"]);

    const splitter = createLangChainTextSplitter({
      splitText: (text: string) => Promise.resolve(text.split("|")),
      createDocuments: () =>
        Promise.resolve([
          new LangChainDocument({ pageContent: "left", metadata: { part: 1 } }),
          new LangChainDocument({ pageContent: "right", metadata: { part: 2 } }),
        ]),
    } as never);
    expect(await splitter.split({ text: "left|right" }, CONTEXT)).toEqual(["left", "right"]);
    expect(await splitter.splitBatch?.({ texts: ["a|b", "c|d"] }, CONTEXT)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(await splitter.splitWithMetadata?.({ text: "left|right" }, CONTEXT)).toHaveLength(2);

    const embedder = createLangChainEmbedder({
      embedQuery: (text: string) => [text.length],
      embedDocuments: (texts: string[]) => Promise.resolve(texts.map((text) => [text.length])),
    } as never);
    expect(embedder.embed({ text: "abc" }, CONTEXT)).toEqual([3]);
    expect(await embedder.embedMany?.({ texts: ["a", "ab"] }, CONTEXT)).toEqual([[1], [2]]);

    const retriever = createLangChainRetriever({
      invoke: () =>
        Promise.resolve([
          new LangChainDocument({ pageContent: "first" }),
          new LangChainDocument({ pageContent: "second" }),
        ]),
    } as never);
    expect(
      (await retriever.retrieve({ query: textRetrievalQuery("find") }, CONTEXT)).documents.map(
        documentText,
      ),
    ).toEqual(["first", "second"]);

    const reranker = createLangChainReranker({
      compressDocuments: (documents: LangChainDocument[]) =>
        Promise.resolve([documents[1], documents[0]].filter(Boolean) as LangChainDocument[]),
    } as never);
    expect(
      (
        await reranker.rerank(
          {
            query: textRetrievalQuery("rank"),
            documents: [textDocument("first"), textDocument("second")],
          },
          CONTEXT,
        )
      ).map(documentText),
    ).toEqual(["second", "first"]);
  });

  test("LangChain vector/indexing adapters preserve cardinality, namespaces and delete forms", async () => {
    const calls: Array<{ kind: string; value: unknown }> = [];
    const nativeStore = {
      addDocuments: (documents: LangChainDocument[], options?: unknown) => {
        calls.push({ kind: "documents", value: { documents, options } });
        return Promise.resolve(documents.map((document, index) => document.id ?? `d-${index}`));
      },
      addVectors: (vectors: number[][], documents: LangChainDocument[], options?: unknown) => {
        calls.push({ kind: "vectors", value: { vectors, documents, options } });
        return Promise.resolve(["v-1"]);
      },
      delete: (options: unknown) => {
        calls.push({ kind: "delete", value: options });
        return Promise.resolve();
      },
    } as unknown as LangChainVectorStore;
    const store = createLangChainVectorStore(nativeStore);

    expect(
      await store.upsert(
        { documents: [textDocument("one", { id: "d-1" })], namespace: "ns" },
        CONTEXT,
      ),
    ).toEqual({ ids: ["d-1"] });
    expect(
      await store.upsert(
        { vectors: [{ id: "v-1", values: [0.1, 0.2] }], namespace: "ns" },
        CONTEXT,
      ),
    ).toEqual({ ids: ["v-1"] });
    expect(await store.delete({ ids: ["d-1"], namespace: "ns" }, CONTEXT)).toBe(true);
    expect(await store.delete({ filter: { stale: true }, namespace: "ns" }, CONTEXT)).toBe(true);
    expect(calls.map((call) => call.kind)).toEqual(["documents", "vectors", "delete", "delete"]);
    expect(calls[2]?.value).toEqual({ ids: ["d-1"], namespace: "ns" });
    expect(calls[3]?.value).toEqual({ filter: { stale: true }, namespace: "ns" });

    const recordManager: RecordManagerInterface = {
      createSchema: async () => {},
      getTime: async () => 0,
      update: async () => {},
      exists: async (keys) => keys.map(() => false),
      listKeys: async () => [],
      deleteKeys: async () => {},
    };
    const indexStore = {
      addDocuments: async (documents: LangChainDocument[]) =>
        documents.map((document, index) => document.id ?? `index-${index}`),
      delete: async () => {},
    } as unknown as LangChainVectorStore;
    const result = await createLangChainIndexer({
      recordManager,
      vectorStore: indexStore,
    }).index({ documents: [textDocument("indexed")] }, CONTEXT);
    expect(result).toEqual({ added: 1, deleted: 0, updated: 0, skipped: 0 });
  });

  test("LlamaIndex preserves loading, splitting, embedding, transformation, retrieval and reranking", async () => {
    const loader = createLlamaIndexDocumentLoader({
      loadData: () =>
        Promise.resolve([
          new LlamaDocument({ text: "loaded-1" }),
          new LlamaDocument({ text: "loaded-2" }),
        ]),
    } as unknown as BaseReader);
    expect((await loader.load(CONTEXT)).map(documentText)).toEqual(["loaded-1", "loaded-2"]);

    const splitter = createLlamaIndexTextSplitter({
      splitText: (text: string) => text.split("|"),
    } as never);
    expect(splitter.split({ text: "left|right" }, CONTEXT)).toEqual(["left", "right"]);
    expect(splitter.splitBatch?.({ texts: ["a|b", "c|d"] }, CONTEXT)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);

    const embedder = createLlamaIndexEmbedder({
      getTextEmbedding: (text: string) => [text.length],
      getTextEmbeddings: (texts: string[]) => Promise.resolve(texts.map((text) => [text.length])),
    } as never);
    expect(embedder.embed({ text: "abc" }, CONTEXT)).toEqual([3]);
    expect(await embedder.embedMany?.({ texts: ["a", "ab"] }, CONTEXT)).toEqual([[1], [2]]);

    const transformer = createLlamaIndexDocumentTransformer({
      getNodesFromDocuments: (documents: LlamaDocument[]) =>
        Promise.resolve(
          documents.map((document) => new LlamaDocument({ text: `${document.text}!` })),
        ),
    } as never);
    expect(
      (await transformer.transform([textDocument("changed")], CONTEXT)).map(documentText),
    ).toEqual(["changed!"]);

    const retriever = createLlamaIndexRetriever({
      retrieve: () =>
        Promise.resolve([
          { node: new LlamaDocument({ text: "first" }), score: 0.2 },
          { node: new LlamaDocument({ text: "second" }), score: 0.8 },
        ]),
    } as never);
    const retrieved = await retriever.retrieve({ query: textRetrievalQuery("find") }, CONTEXT);
    expect(retrieved.documents.map(documentText)).toEqual(["first", "second"]);
    expect(retrieved.documents.map((document) => document.score)).toEqual([0.2, 0.8]);

    const reranker = createLlamaIndexReranker({
      postprocessNodes: (nodes: unknown[]) => Promise.resolve([...nodes].reverse()),
    } as never);
    expect(
      (
        await reranker.rerank(
          { query: textRetrievalQuery("rank"), documents: retrieved.documents },
          CONTEXT,
        )
      ).map(documentText),
    ).toEqual(["second", "first"]);
  });

  test("LlamaIndex query/synthesis streams preserve event order and vector delete tri-state", async () => {
    const source = new LlamaDocument({ text: "source" });
    const completion = EngineResponse.fromResponse("complete", false, [
      { node: source, score: 0.7 },
    ]);
    const delta = EngineResponse.fromResponse("delta", true, [{ node: source, score: 0.7 }]);
    const iterable = {
      async *[Symbol.asyncIterator]() {
        yield delta;
      },
    };
    const engine = {
      query: async ({ stream }: { stream?: boolean }) => (stream ? iterable : completion),
    } as unknown as BaseQueryEngine;
    const queryEngine = createLlamaIndexQueryEngine(engine);
    const result = await queryEngine.query({ query: textRetrievalQuery("q") }, CONTEXT);
    expect(documentText({ content: result.content })).toBe("complete");
    expect(result.sources?.map(documentText)).toEqual(["source"]);
    const queryEvents = await collect(
      queryEngine.stream?.({ query: textRetrievalQuery("q") }, CONTEXT) ?? [],
    );
    expect(queryEvents.map((event) => event.kind)).toEqual(["start", "delta", "end"]);

    const synthesizer = {
      synthesize: async (_input: unknown, stream?: boolean) => (stream ? iterable : completion),
    } as unknown as BaseSynthesizer;
    const responseSynthesizer = createLlamaIndexResponseSynthesizer(synthesizer);
    const synthesis = await responseSynthesizer.synthesize(
      { query: textRetrievalQuery("q"), documents: [textDocument("fallback")] },
      CONTEXT,
    );
    expect(documentText({ content: synthesis.content })).toBe("complete");
    const synthesisEvents = await collect(
      responseSynthesizer.stream?.(
        { query: textRetrievalQuery("q"), documents: [textDocument("fallback")] },
        CONTEXT,
      ) ?? [],
    );
    expect(synthesisEvents.map((event) => event.kind)).toEqual(["start", "delta", "end"]);

    const deleted: string[] = [];
    const nativeStore = {
      add: async (nodes: LlamaDocument[]) => nodes.map((node) => node.id_),
      delete: async (id: string) => {
        deleted.push(id);
      },
    } as unknown as BaseVectorStore;
    const store = createLlamaIndexVectorStore(nativeStore);
    expect(await store.upsert({ vectors: [{ id: "v-1", values: [1, 2] }] }, CONTEXT)).toEqual({
      ids: ["v-1"],
    });
    expect(await store.delete({ ids: ["v-1"] }, CONTEXT)).toBe(true);
    expect(await store.delete({ filter: { stale: true } }, CONTEXT)).toBeNull();
    expect(deleted).toEqual(["v-1"]);
  });

  test("redacts native LlamaIndex stream failures", async () => {
    const engine = {
      query: async () => rejectingStream("credential=sk-sensitive"),
    } as unknown as BaseQueryEngine;
    const events = await collect(
      createLlamaIndexQueryEngine(engine).stream?.({ query: textRetrievalQuery("q") }, CONTEXT) ??
        [],
    );

    expect(events).toEqual([
      { kind: "start" },
      {
        kind: "error",
        error: {
          severity: "error",
          code: "llamaindex-stream-error",
          message: "LlamaIndex stream failed.",
          data: { cause: "native-error" },
        },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("sk-sensitive");
  });
});
