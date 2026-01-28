import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../workflow/helpers";
import {
  createMockSplitter,
  createMockEmbedder,
  createMockVectorStore,
} from "../fixtures/factories";
import { recipes } from "../../src/recipes";

const createLoader = (documents: Array<{ id: string; text: string }>) => ({
  load: () => documents,
});

describe("Ingest recipe", () => {
  it("splits, embeds, and upserts documents", () => {
    const splitter = createMockSplitter();
    const embedder = createMockEmbedder();
    const { store, calls } = createMockVectorStore();
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
    const splitter = createMockSplitter();
    const embedder = createMockEmbedder();
    const { store, calls } = createMockVectorStore();
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
    const splitter = createMockSplitter(true);
    const { store, calls } = createMockVectorStore();
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
    const splitter = createMockSplitter();
    const embedder = createMockEmbedder([0.4, 0.5], true);
    const { store, calls } = createMockVectorStore();
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
