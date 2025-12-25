import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fromAiSdkEmbeddings,
  fromAiSdkImageModel,
  fromAiSdkModel,
  fromAiSdkReranker,
  fromAiSdkSpeechModel,
  fromAiSdkTool,
  fromAiSdkTranscriptionModel,
  fromLangChainEmbeddings,
  fromLangChainLoader,
  fromLangChainMemory,
  fromLangChainModel,
  fromLangChainPromptTemplate,
  fromLangChainReranker,
  fromLangChainRetriever,
  fromLangChainStore,
  fromLangChainTextSplitter,
  fromLangChainTool,
  fromLangChainTransformer,
  fromLangChainVectorStore,
  fromLlamaIndexDocumentStore,
  fromLlamaIndexEmbeddings,
  fromLlamaIndexLoader,
  fromLlamaIndexMemory,
  fromLlamaIndexModel,
  fromLlamaIndexPromptTemplate,
  fromLlamaIndexReranker,
  fromLlamaIndexRetriever,
  fromLlamaIndexTextSplitter,
  fromLlamaIndexTool,
  fromLlamaIndexTransformer,
  fromLlamaIndexVectorStore,
} from "#adapters";

type ParityEntry = {
  construct: string;
  ecosystem: string;
  status: "full" | "partial" | "provider-specific" | "missing";
  probe?: string;
  note?: string;
};

type ParitySpec = {
  entries: ParityEntry[];
};

const isFunction = (value: unknown): value is (...args: unknown[]) => unknown =>
  typeof value === "function";

const probes: Record<string, () => boolean> = {
  "ai-sdk:Model": () => isFunction(fromAiSdkModel),
  "ai-sdk:Embedder": () => isFunction(fromAiSdkEmbeddings),
  "ai-sdk:Reranker": () => isFunction(fromAiSdkReranker),
  "ai-sdk:Tool": () => isFunction(fromAiSdkTool),
  "ai-sdk:ImageModel": () => isFunction(fromAiSdkImageModel),
  "ai-sdk:SpeechModel": () => isFunction(fromAiSdkSpeechModel),
  "ai-sdk:TranscriptionModel": () => isFunction(fromAiSdkTranscriptionModel),
  "langchain:Model": () => isFunction(fromLangChainModel),
  "langchain:Embedder": () => isFunction(fromLangChainEmbeddings),
  "langchain:Reranker": () => isFunction(fromLangChainReranker),
  "langchain:Retriever": () => isFunction(fromLangChainRetriever),
  "langchain:TextSplitter": () => isFunction(fromLangChainTextSplitter),
  "langchain:Transformer": () => isFunction(fromLangChainTransformer),
  "langchain:DocumentLoader": () => isFunction(fromLangChainLoader),
  "langchain:VectorStore": () => isFunction(fromLangChainVectorStore),
  "langchain:Memory": () => isFunction(fromLangChainMemory),
  "langchain:KVStore": () => isFunction(fromLangChainStore),
  "langchain:Tool": () => isFunction(fromLangChainTool),
  "langchain:PromptTemplate": () => isFunction(fromLangChainPromptTemplate),
  "llamaindex:Model": () => isFunction(fromLlamaIndexModel),
  "llamaindex:Embedder": () => isFunction(fromLlamaIndexEmbeddings),
  "llamaindex:Reranker": () => isFunction(fromLlamaIndexReranker),
  "llamaindex:Retriever": () => isFunction(fromLlamaIndexRetriever),
  "llamaindex:TextSplitter": () => isFunction(fromLlamaIndexTextSplitter),
  "llamaindex:Transformer": () => isFunction(fromLlamaIndexTransformer),
  "llamaindex:DocumentLoader": () => isFunction(fromLlamaIndexLoader),
  "llamaindex:VectorStore": () => isFunction(fromLlamaIndexVectorStore),
  "llamaindex:Memory": () => isFunction(fromLlamaIndexMemory),
  "llamaindex:KVStore": () => isFunction(fromLlamaIndexDocumentStore),
  "llamaindex:Tool": () => isFunction(fromLlamaIndexTool),
  "llamaindex:PromptTemplate": () => isFunction(fromLlamaIndexPromptTemplate),
};

const loadParitySpec = (): ParitySpec => {
  const filePath = resolve(process.cwd(), "internal/interop-parity.json");
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as ParitySpec;
};

describe("Interop parity audit", () => {
  it("keeps the parity spec well-formed", () => {
    const spec = loadParitySpec();
    const seen = new Set<string>();
    for (const entry of spec.entries) {
      const key = `${entry.ecosystem}:${entry.construct}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(["full", "partial", "provider-specific", "missing"]).toContain(entry.status);

      if (entry.status === "missing") {
        expect(entry.note).toBeTruthy();
        expect(entry.probe).toBeUndefined();
        continue;
      }

      if (entry.status === "partial" || entry.status === "provider-specific") {
        expect(entry.note).toBeTruthy();
      }

      expect(entry.probe).toBeTruthy();
      const probe = entry.probe ? probes[entry.probe] : undefined;
      expect(probe).toBeTruthy();
      expect(probe?.()).toBe(true);
    }
  });
});
