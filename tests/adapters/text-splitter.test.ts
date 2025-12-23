import { describe, expect, it } from "bun:test";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SentenceSplitter } from "@llamaindex/core/node-parser";
import { fromLangChainTextSplitter, fromLlamaIndexTextSplitter } from "#adapters";
import { captureDiagnostics } from "./helpers";

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

  it("warns when text splitter inputs are missing", async () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 10, chunkOverlap: 0 });
    const adapter = fromLangChainTextSplitter(splitter);
    const { context, diagnostics } = captureDiagnostics();

    const result = await adapter.split(" ", context);
    expect(result).toEqual([]);
    expect(diagnostics[0]?.message).toBe("text_splitter_input_missing");
  });

  it("warns when LangChain batch inputs are missing", async () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 10, chunkOverlap: 0 });
    const adapter = fromLangChainTextSplitter(splitter);
    const { context, diagnostics } = captureDiagnostics();

    const result = await adapter.splitBatch?.([" "], context);
    expect(result).toEqual([]);
    expect(diagnostics[0]?.message).toBe("text_splitter_input_missing");
  });

  it("warns when LlamaIndex inputs are missing", () => {
    const splitter = new SentenceSplitter();
    const adapter = fromLlamaIndexTextSplitter(splitter);
    const { context, diagnostics } = captureDiagnostics();

    const result = adapter.split(" ", context);
    const batch = adapter.splitBatch?.([" "], context);
    const withMeta = adapter.splitWithMetadata?.(" ", context);
    expect(result).toEqual([]);
    expect(batch).toEqual([]);
    expect(withMeta).toEqual([]);
    expect(diagnostics[0]?.message).toBe("text_splitter_input_missing");
  });
});
