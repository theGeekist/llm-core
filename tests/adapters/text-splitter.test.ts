import { describe, expect, it } from "bun:test";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SentenceSplitter } from "@llamaindex/core/node-parser";
import { fromLangChainTextSplitter, fromLlamaIndexTextSplitter } from "#adapters";

const SAMPLE = "Hello world. This is a test.";

describe("Adapter text splitters", () => {
  it("adapts LangChain text splitters", async () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 10, chunkOverlap: 0 });
    const adapter = fromLangChainTextSplitter(splitter);

    await expect(adapter.split(SAMPLE)).resolves.toBeArray();
    await expect(adapter.splitBatch?.([SAMPLE])).resolves.toBeArray();
    await expect(adapter.splitWithMetadata?.(SAMPLE)).resolves.toBeArray();
  });

  it("adapts LlamaIndex text splitters", () => {
    const splitter = new SentenceSplitter();
    const adapter = fromLlamaIndexTextSplitter(splitter);

    expect(adapter.split(SAMPLE)).toBeArray();
    expect(adapter.splitBatch?.([SAMPLE])).toBeArray();
    expect(adapter.splitWithMetadata?.(SAMPLE)).toBeArray();
  });
});
