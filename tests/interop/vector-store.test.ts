import { describe, expect, it } from "bun:test";
import type { VectorStore } from "#adapters";
import { fromLangChainVectorStore, fromLlamaIndexVectorStore } from "#adapters";
import { asLangChainVectorStore, asLlamaIndexVectorStore } from "./helpers";

const makeVectorStore = (): VectorStore => ({
  upsert: () => ({ ids: [] }),
  delete: () => undefined,
});

describe("Interop vector store", () => {
  it("maps LangChain vector stores to VectorStore", () => {
    const store = asLangChainVectorStore({
      addDocuments: () => ["id-1"],
      addVectors: () => ["id-2"],
      delete: () => Promise.resolve(),
    });
    const adapter = fromLangChainVectorStore(store);
    expect(typeof adapter.upsert).toBe("function");
    expect(typeof adapter.delete).toBe("function");
  });

  it("maps LlamaIndex vector stores to VectorStore", () => {
    const store = asLlamaIndexVectorStore({
      add: () => Promise.resolve(["id-1"]),
      delete: () => Promise.resolve(),
    });
    const adapter = fromLlamaIndexVectorStore(store);
    expect(typeof adapter.upsert).toBe("function");
    expect(typeof adapter.delete).toBe("function");
  });

  it("notes AI SDK has no vector store abstraction", () => {
    const store = makeVectorStore();
    expect(store.upsert({ documents: [] })).toBeDefined();
  });
});
