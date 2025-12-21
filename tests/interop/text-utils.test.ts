import { describe, expect, it } from "bun:test";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SentenceSplitter } from "@llamaindex/core/node-parser";
import * as AiSdk from "ai";
import type { AdapterTextSplitter } from "#workflow";
import { mapMaybe } from "./helpers";

const TEXT_SAMPLE = "Hello world.";
const TEXT_BATCH = ["One.", "Two."];

const toAdapterTextSplitterFromLangChain = (
  splitter: RecursiveCharacterTextSplitter,
): AdapterTextSplitter => ({
  split: (text: string) => splitter.splitText(text),
  splitBatch: (texts: string[]) => Promise.all(texts.map((text) => splitter.splitText(text))),
  splitWithMetadata: (text: string) =>
    mapMaybe(splitter.createDocuments([text], [{ source: "langchain" }]), (docs) =>
      docs.map((doc) => ({ text: doc.pageContent, metadata: doc.metadata })),
    ),
});

const toAdapterTextSplitterFromLlama = (splitter: SentenceSplitter): AdapterTextSplitter => ({
  split: (text: string) => splitter.splitText(text),
  splitBatch: (texts: string[]) => texts.map((text) => splitter.splitText(text)),
  splitWithMetadata: (text: string) => splitter.splitText(text).map((chunk) => ({ text: chunk })),
});

describe("Interop text utilities", () => {
  it("maps LangChain text splitter to AdapterTextSplitter", async () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 10, chunkOverlap: 0 });
    const adapter = toAdapterTextSplitterFromLangChain(splitter);

    await expect(adapter.split(TEXT_SAMPLE)).resolves.toBeArray();
    await expect(adapter.splitBatch?.(TEXT_BATCH)).resolves.toBeArray();
    await expect(adapter.splitWithMetadata?.(TEXT_SAMPLE)).resolves.toBeArray();
  });

  it("maps LlamaIndex text splitter to AdapterTextSplitter", () => {
    const splitter = new SentenceSplitter();
    const adapter = toAdapterTextSplitterFromLlama(splitter);

    expect(adapter.split(TEXT_SAMPLE)).toBeArray();
    expect(adapter.splitBatch?.(TEXT_BATCH)).toBeArray();
    expect(adapter.splitWithMetadata?.(TEXT_SAMPLE)).toBeArray();
  });

  it("notes AI SDK has no text splitter abstraction", () => {
    expect("TextSplitter" in AiSdk).toBe(false);
  });
});
