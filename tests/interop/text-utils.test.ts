import { describe, expect, it } from "bun:test";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SentenceSplitter } from "@llamaindex/core/node-parser";
import * as AiSdk from "ai";
import type { TextSplitter } from "#workflow";
import { maybeMap } from "./helpers";

const TEXT_SAMPLE = "Hello world.";
const TEXT_BATCH = ["One.", "Two."];

const toTextSplitterFromLangChain = (splitter: RecursiveCharacterTextSplitter): TextSplitter => ({
  split: (text: string) => splitter.splitText(text),
  splitBatch: (texts: string[]) => Promise.all(texts.map((text) => splitter.splitText(text))),
  splitWithMetadata: (text: string) =>
    maybeMap(
      (docs) => docs.map((doc) => ({ text: doc.pageContent, metadata: doc.metadata })),
      splitter.createDocuments([text], [{ source: "langchain" }]),
    ),
});

const toTextSplitterFromLlama = (splitter: SentenceSplitter): TextSplitter => ({
  split: (text: string) => splitter.splitText(text),
  splitBatch: (texts: string[]) => texts.map((text) => splitter.splitText(text)),
  splitWithMetadata: (text: string) => splitter.splitText(text).map((chunk) => ({ text: chunk })),
});

describe("Interop text utilities", () => {
  it("maps LangChain text splitter to TextSplitter", async () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 10, chunkOverlap: 0 });
    const adapter = toTextSplitterFromLangChain(splitter);

    await expect(adapter.split(TEXT_SAMPLE)).resolves.toBeArray();
    await expect(adapter.splitBatch?.(TEXT_BATCH)).resolves.toBeArray();
    await expect(adapter.splitWithMetadata?.(TEXT_SAMPLE)).resolves.toBeArray();
  });

  it("maps LlamaIndex text splitter to TextSplitter", () => {
    const splitter = new SentenceSplitter();
    const adapter = toTextSplitterFromLlama(splitter);

    expect(adapter.split(TEXT_SAMPLE)).toBeArray();
    expect(adapter.splitBatch?.(TEXT_BATCH)).toBeArray();
    expect(adapter.splitWithMetadata?.(TEXT_SAMPLE)).toBeArray();
  });

  it("notes AI SDK has no text splitter abstraction", () => {
    expect("TextSplitter" in AiSdk).toBe(false);
  });
});
