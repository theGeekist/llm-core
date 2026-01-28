import { describe, expect, it } from "bun:test";
import type { Document, VectorRecord } from "#adapters";
import { fromLangChainVectorStore, fromLlamaIndexVectorStore } from "#adapters";
import { asLangChainVectorStore, asLlamaIndexVectorStore, captureDiagnostics } from "./helpers";

const makeDocument = (overrides: Partial<Document> = {}): Document => ({
  text: "hello",
  ...overrides,
});

describe("Adapter vector store", () => {
  it("maps LangChain vector store upserts and deletes", async () => {
    const addDocumentsCalls: Array<{ docs: unknown[]; options?: unknown }> = [];
    const addVectorsCalls: Array<{ vectors: number[][]; docs: unknown[]; options?: unknown }> = [];
    const deleteCalls: unknown[] = [];
    const store = asLangChainVectorStore({
      addDocuments: (docs: unknown[], options?: unknown) => {
        addDocumentsCalls.push({ docs, options });
        return Promise.resolve(["doc-1"]);
      },
      addVectors: (vectors: number[][], docs: unknown[], options?: unknown) => {
        addVectorsCalls.push({ vectors, docs, options });
        return ["vec-1"];
      },
      delete: (options?: unknown) => {
        deleteCalls.push(options);
        return Promise.resolve();
      },
    });
    const adapter = fromLangChainVectorStore(store);

    const result = await adapter.upsert({ documents: [makeDocument()], namespace: "ns" });
    expect(result).toEqual({ ids: ["doc-1"] });
    expect(addDocumentsCalls).toHaveLength(1);

    const vectorDoc = makeDocument({ id: "vec-doc" });
    const vectors: VectorRecord[] = [{ id: "vec-1", values: [0.1, 0.2], document: vectorDoc }];
    const vectorResult = await adapter.upsert({ vectors, namespace: "ns" });
    expect(vectorResult).toEqual({ ids: ["vec-1"] });
    expect(addVectorsCalls).toHaveLength(1);

    await adapter.delete({ ids: ["doc-1"] });
    await adapter.delete({ filter: { tag: "x" } });
    expect(deleteCalls).toHaveLength(2);
  });

  it("maps LlamaIndex vector store vectors and warns on unsupported filters", async () => {
    const addCalls: Array<{ nodes: Array<{ embedding?: number[]; id_?: string }> }> = [];
    const deleteCalls: string[] = [];
    const store = asLlamaIndexVectorStore({
      add: (nodes: Array<{ embedding?: number[]; id_?: string }>) => {
        addCalls.push({ nodes });
        return Promise.resolve(["node-1"]);
      },
      delete: (id: string) => {
        deleteCalls.push(id);
        return Promise.resolve();
      },
    });
    const adapter = fromLlamaIndexVectorStore(store);

    const vectors: VectorRecord[] = [{ id: "node-1", values: [1, 2, 3] }];
    const result = await adapter.upsert({ vectors });
    expect(result).toEqual({ ids: ["node-1"] });
    expect(addCalls[0]?.nodes[0]?.embedding).toEqual([1, 2, 3]);

    await adapter.delete({ ids: ["node-1"] });
    expect(deleteCalls).toEqual(["node-1"]);

    const { context, diagnostics } = captureDiagnostics();
    await adapter.delete({ filter: { tag: "x" } }, context);
    expect(diagnostics.map((entry) => entry.message)).toContain(
      "vector_store_delete_filter_unsupported",
    );
  });
});
