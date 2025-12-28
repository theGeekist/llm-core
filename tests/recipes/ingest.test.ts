import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../workflow/helpers";
import type { Embedder, TextSplitter, VectorStore } from "../../src/adapters/types";
import { recipes } from "../../src/recipes";

const createSplitter = (): TextSplitter => ({
  split: (text) => [text],
});

const createSplitterWithMetadata = (): TextSplitter => ({
  split: (text) => [text],
  splitWithMetadata: (text) => [{ text, metadata: { source: "meta" } }],
});

const createEmbedder = (): Embedder => ({
  embed: () => [0.1, 0.2, 0.3],
});

const createEmbedderWithMany = (): Embedder => ({
  embed: () => [0.1, 0.2, 0.3],
  embedMany: (texts) => texts.map(() => [0.4, 0.5]),
});

const createVectorStore = () => {
  const calls: Array<{ documents?: unknown; vectors?: unknown }> = [];
  const store: VectorStore = {
    upsert: (input) => {
      calls.push({
        documents: (input as { documents?: unknown }).documents,
        vectors: (input as { vectors?: unknown }).vectors,
      });
      return null;
    },
    delete: () => null,
  };
  return { store, calls };
};

const createLoader = (documents: Array<{ id: string; text: string }>) => ({
  load: () => documents,
});

describe("Ingest recipe", () => {
  it("splits, embeds, and upserts documents", () => {
    const splitter = createSplitter();
    const embedder = createEmbedder();
    const { store, calls } = createVectorStore();
    const runtime = recipes
      .ingest()
      .defaults({ adapters: { textSplitter: splitter, embedder, vectorStore: store } })
      .build();
    expect(runtime.declaredAdapters().vectorStore).toBe(store);
    const outcome = assertSyncOutcome(
      runtime.run({ sourceId: "src", documents: [{ id: "doc-1", text: "doc" }] }),
    );

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const embeddings = (outcome.artefact as { "ingest.embeddings"?: unknown[] })[
      "ingest.embeddings"
    ];
    expect(embeddings).toBeDefined();
    expect(calls.length).toBe(1);
    expect(calls[0]?.vectors).toBeDefined();
  });

  it("uses loader results when provided", () => {
    const splitter = createSplitter();
    const embedder = createEmbedder();
    const { store, calls } = createVectorStore();
    const loader = createLoader([{ id: "loaded", text: "from-loader" }]);
    const runtime = recipes
      .ingest()
      .defaults({
        adapters: { textSplitter: splitter, embedder, vectorStore: store, loader },
      })
      .build();

    const outcome = assertSyncOutcome(
      runtime.run({ sourceId: "src", documents: [{ id: "doc-1", text: "doc" }] }),
    );
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(calls[0]?.vectors).toBeDefined();
  });

  it("prefers splitWithMetadata when available", () => {
    const splitter = createSplitterWithMetadata();
    const { store, calls } = createVectorStore();
    const runtime = recipes
      .ingest()
      .defaults({ adapters: { textSplitter: splitter, vectorStore: store } })
      .build();

    const outcome = assertSyncOutcome(
      runtime.run({ sourceId: "src", documents: [{ id: "doc-1", text: "doc" }] }),
    );
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(calls[0]?.documents).toBeDefined();
  });

  it("uses embedMany when available", () => {
    const splitter = createSplitter();
    const embedder = createEmbedderWithMany();
    const { store, calls } = createVectorStore();
    const runtime = recipes
      .ingest()
      .defaults({ adapters: { textSplitter: splitter, embedder, vectorStore: store } })
      .build();

    const outcome = assertSyncOutcome(
      runtime.run({ sourceId: "src", documents: [{ id: "doc-1", text: "doc" }] }),
    );
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(calls[0]?.vectors).toBeDefined();
  });
});
