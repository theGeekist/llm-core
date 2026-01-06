import { bindFirst, maybeMap, maybeAll } from "../../maybe";
import { Recipe } from "../flow";
import { createRecipeFactory, createRecipeHandle } from "../handle";
import type { RecipeDefaults, StepApply } from "../flow";
import type { Document, Embedder, TextSplitter, VectorRecord } from "../../adapters/types";
import { isRecord, readString } from "../../adapters/utils";

export type IngestConfig = {
  defaults?: RecipeDefaults;
};

type IngestState = Record<string, unknown>;

const INGEST_STATE_PREFIX = "ingest.";

const readInputRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const isDocument = (value: unknown): value is Document =>
  !!value && typeof value === "object" && typeof (value as Document).text === "string";

const readDocuments = (value: unknown): Document[] => {
  if (Array.isArray(value)) {
    return value.filter(isDocument);
  }
  return [];
};

const readIngestState = (state: Record<string, unknown>): IngestState => state;

const toIngestKey = (key: string) => `${INGEST_STATE_PREFIX}${key}`;

const setIngestValue = (state: IngestState, key: string, value: unknown) => {
  state[toIngestKey(key)] = value;
};

const readIngestValue = <T>(state: IngestState, key: string) =>
  state[toIngestKey(key)] as T | undefined;

const seedInput = (ingest: IngestState, input: unknown) => {
  const record = readInputRecord(input);
  const sourceId = readString(record?.sourceId);
  if (sourceId) {
    setIngestValue(ingest, "sourceId", sourceId);
  }
  if (record?.documents) {
    setIngestValue(ingest, "documents", readDocuments(record.documents));
  }
};

// Seeds ingest state from input (sourceId + documents).
const applySeed: StepApply = ({ input, state }) => {
  seedInput(readIngestState(state), input);
  return null;
};

const applyLoadResult = (ingest: IngestState, documents: Document[] | undefined) => {
  if (documents) {
    setIngestValue(ingest, "documents", documents);
  }
  return null;
};

// Optional loader step that can replace or enrich incoming documents.
const applyLoad: StepApply = ({ context, state }) => {
  const ingest = readIngestState(state);
  const loader = context.adapters?.loader;
  if (!loader) {
    return null;
  }
  return maybeMap(bindFirst(applyLoadResult, ingest), loader.load());
};

type DocumentMetadata = Document["metadata"];

const toChunkDocument = (
  source: Document,
  chunk: { text: string; metadata?: DocumentMetadata },
) => ({
  text: chunk.text,
  metadata: chunk.metadata ?? source.metadata,
});

const toChunkDocuments = (
  source: Document,
  chunks: Array<{ text: string; metadata?: DocumentMetadata }>,
) => chunks.map(bindFirst(toChunkDocument, source));

type TextSplitterWithMetadata = TextSplitter & {
  splitWithMetadata: NonNullable<TextSplitter["splitWithMetadata"]>;
};

const splitDocumentWithMetadata = (splitter: TextSplitterWithMetadata, doc: Document) =>
  maybeMap(bindFirst(toChunkDocuments, doc), splitter.splitWithMetadata(doc.text));

const toSimpleChunkDocument = (source: Document, text: string) => ({
  text,
  metadata: source.metadata,
});

const toSimpleChunkDocuments = (source: Document, chunks: string[]) =>
  chunks.map(bindFirst(toSimpleChunkDocument, source));

const splitDocumentSimple = (splitter: TextSplitter, doc: Document) =>
  maybeMap(bindFirst(toSimpleChunkDocuments, doc), splitter.split(doc.text));

const flattenChunks = (chunks: Document[][]) => chunks.flat();

const splitDocuments = (splitter: TextSplitter, documents: Document[]) => {
  if (splitter.splitWithMetadata) {
    const splitterWithMetadata = splitter as TextSplitterWithMetadata;
    return maybeMap(
      flattenChunks,
      maybeAll(documents.map(bindFirst(splitDocumentWithMetadata, splitterWithMetadata))),
    );
  }
  return maybeMap(flattenChunks, maybeAll(documents.map(bindFirst(splitDocumentSimple, splitter))));
};

const applySplitResult = (ingest: IngestState, chunks: Document[] | undefined) => {
  if (chunks) {
    setIngestValue(ingest, "chunks", chunks);
  }
  return null;
};

// Splits documents into chunks using the text splitter adapter.
const applySplit: StepApply = ({ context, state }) => {
  const ingest = readIngestState(state);
  const splitter = context.adapters?.textSplitter;
  const documents = readIngestValue<Document[]>(ingest, "documents");
  if (!splitter || !documents?.length) {
    return null;
  }
  return maybeMap(bindFirst(applySplitResult, ingest), splitDocuments(splitter, documents));
};

const readDocumentText = (doc: Document) => doc.text;

const readDocumentTexts = (documents: Document[]) => documents.map(readDocumentText);

const toVectorRecord = (vectors: number[][], doc: Document, index: number): VectorRecord => ({
  document: doc,
  values: vectors[index] ?? [],
});

const toVectorRecords = (documents: Document[], vectors: number[][]) =>
  documents.map((doc, index) => toVectorRecord(vectors, doc, index));

type EmbedderWithMany = Embedder & { embedMany: NonNullable<Embedder["embedMany"]> };

const embedDocumentsMany = (embedder: EmbedderWithMany, documents: Document[]) =>
  maybeMap(bindFirst(toVectorRecords, documents), embedder.embedMany(readDocumentTexts(documents)));

const toVectorFromValues = (doc: Document, values: number[]): VectorRecord => ({
  document: doc,
  values,
});

const embedDocument = (embedder: Embedder, doc: Document) =>
  maybeMap(bindFirst(toVectorFromValues, doc), embedder.embed(doc.text));

const embedDocuments = (embedder: Embedder, documents: Document[]) => {
  if (embedder.embedMany) {
    return embedDocumentsMany(embedder as EmbedderWithMany, documents);
  }
  return maybeAll(documents.map(bindFirst(embedDocument, embedder)));
};

const applyEmbedResult = (ingest: IngestState, vectors: VectorRecord[] | undefined) => {
  if (vectors) {
    setIngestValue(ingest, "embeddings", vectors);
  }
  return null;
};

// Embeds chunks into vectors when an embedder is available.
const applyEmbed: StepApply = ({ context, state }) => {
  const ingest = readIngestState(state);
  const embedder = context.adapters?.embedder;
  const chunks = readIngestValue<Document[]>(ingest, "chunks");
  if (!embedder || !chunks?.length) {
    return null;
  }
  return maybeMap(bindFirst(applyEmbedResult, ingest), embedDocuments(embedder, chunks));
};

const buildUpsertInput = (ingest: IngestState) => {
  const embeddings = readIngestValue<VectorRecord[]>(ingest, "embeddings");
  if (embeddings && embeddings.length > 0) {
    return { vectors: embeddings };
  }
  const chunks = readIngestValue<Document[]>(ingest, "chunks");
  if (chunks && chunks.length > 0) {
    return { documents: chunks };
  }
  const documents = readIngestValue<Document[]>(ingest, "documents");
  if (documents && documents.length > 0) {
    return { documents };
  }
  return null;
};

// Writes documents or vectors to the vector store adapter.
const toNull = () => null;

const applyIndex: StepApply = ({ context, state }) => {
  const ingest = readIngestState(state);
  const store = context.adapters?.vectorStore;
  const upsert = buildUpsertInput(ingest);
  if (!store || !upsert) {
    return null;
  }
  return maybeMap(toNull, store.upsert(upsert));
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineIngestSteps = ({ step }: PackTools) => ({
  seed: step("seed", applySeed),
  load: step("load", applyLoad).dependsOn("seed"),
  split: step("split", applySplit).dependsOn("seed"),
  embed: step("embed", applyEmbed).dependsOn("split"),
  index: step("index", applyIndex).dependsOn("embed"),
});

export const createIngestPack = (config?: IngestConfig) =>
  Recipe.pack("ingest", defineIngestSteps, {
    defaults: config?.defaults,
    minimumCapabilities: ["vectorStore"],
  });

const resolveIngestPack = (config?: IngestConfig) =>
  config ? createIngestPack(config) : IngestPack;

const resolveIngestRecipeDefinition = (config?: IngestConfig) => ({
  packs: [resolveIngestPack(config)],
});

const ingestRecipeFactory = createRecipeFactory("ingest", resolveIngestRecipeDefinition);

// Full ingestion recipe: load -> split -> embed -> index.
export const createIngestRecipe = (config?: IngestConfig) =>
  createRecipeHandle(ingestRecipeFactory, config);

export const ingestRecipe = (config?: IngestConfig) => createIngestRecipe(config);
export const IngestPack = createIngestPack();
