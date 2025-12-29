import { recipes } from "#recipes";
import type { IngestConfig } from "#recipes";
import type { AdapterBundle } from "#adapters";

// Mocks for snippet context
const loader = {} as AdapterBundle["loader"];
const textSplitter = {} as AdapterBundle["textSplitter"];
const embedder = {} as AdapterBundle["embedder"];
const vectorStore = {} as AdapterBundle["vectorStore"];

// Reuse loader/textSplitter/embedder/vectorStore from the quick start.
const config = {
  defaults: {
    adapters: { loader, textSplitter, embedder, vectorStore },
  },
} satisfies IngestConfig;

const ingest = recipes.ingest().configure(config);

void ingest;
