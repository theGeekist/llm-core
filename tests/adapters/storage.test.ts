import { describe, expect, it } from "bun:test";
import { fromLangChainStore, fromLlamaIndexDocumentStore } from "#adapters";
import { asLangChainStore, asLlamaIndexDocStore, captureDiagnostics } from "./helpers";

describe("Adapter storage", () => {
  it("maps LangChain stores", async () => {
    const store = asLangChainStore({
      mget: () => Promise.resolve([undefined]),
      mset: () => Promise.resolve(),
      mdelete: () => Promise.resolve(),
      yieldKeys: async function* (prefix?: string) {
        yield prefix ? `${prefix}:one` : "key";
      },
    });

    const adapter = fromLangChainStore(store);
    await expect(adapter.mget(["key"])).resolves.toEqual([undefined]);
    await expect(adapter.mset([["key", { ok: true }]])).resolves.toBeUndefined();
    await expect(adapter.mdelete(["key"])).resolves.toBeUndefined();
    await expect(adapter.list?.()).resolves.toEqual(["key"]);
    await expect(adapter.list?.("pref")).resolves.toEqual(["pref:one"]);
  });

  it("warns when kv keys are missing", async () => {
    const store = asLangChainStore({
      mget: () => Promise.resolve([]),
      mset: () => Promise.resolve(),
      mdelete: () => Promise.resolve(),
      yieldKeys: async function* () {
        yield "key";
      },
    });
    const adapter = fromLangChainStore(store);
    const { context, diagnostics } = captureDiagnostics();

    const result = await adapter.mget([], context);
    expect(result).toEqual([]);
    expect(diagnostics[0]?.message).toBe("kv_keys_missing");
  });

  it("warns when kv pairs or delete keys are missing", async () => {
    const store = asLangChainStore({
      mget: () => Promise.resolve([]),
      mset: () => Promise.resolve(),
      mdelete: () => Promise.resolve(),
      yieldKeys: async function* () {
        yield "key";
      },
    });
    const adapter = fromLangChainStore(store);
    const { context, diagnostics } = captureDiagnostics();

    await adapter.mset([], context);
    await adapter.mdelete([], context);
    expect(diagnostics.map((entry) => entry.message)).toContain("kv_pairs_missing");
    expect(diagnostics.map((entry) => entry.message)).toContain("kv_keys_missing");
  });

  it("maps LlamaIndex document stores", async () => {
    let saved: unknown[] = [];
    const store = asLlamaIndexDocStore({
      docs: () => Promise.resolve({ "doc-1": {}, "doc-2": {} }),
      addDocuments: (docs: unknown[]) => {
        saved = docs;
        return Promise.resolve();
      },
      getDocument: (key: string) =>
        Promise.resolve({
          toJSON: () => ({ id: key, text: "doc" }),
        }),
      deleteDocument: () => Promise.resolve(),
    });

    const adapter = fromLlamaIndexDocumentStore(store);
    await expect(adapter.mget(["key"])).resolves.toEqual([{ id: "key", text: "doc" }]);
    await expect(
      adapter.mset?.([
        ["doc-1", { text: "doc-1" }],
        ["doc-2", { text: "skip" }],
      ]),
    ).resolves.toBeUndefined();
    expect(saved).toMatchObject([
      { id_: "doc-1", text: "doc-1" },
      { id_: "doc-2", text: "skip" },
    ]);
    await expect(adapter.mdelete?.(["doc-1"])).resolves.toBeUndefined();
    await expect(adapter.list?.()).resolves.toEqual(["doc-1", "doc-2"]);
  });

  it("warns when LlamaIndex kv inputs are missing", async () => {
    const store = asLlamaIndexDocStore({
      docs: () => Promise.resolve({}),
      addDocuments: () => Promise.resolve(),
      getDocument: () => Promise.resolve(undefined),
      deleteDocument: () => Promise.resolve(),
    });
    const adapter = fromLlamaIndexDocumentStore(store);
    const { context, diagnostics } = captureDiagnostics();

    await adapter.mget([], context);
    await adapter.mset?.([], context);
    await adapter.mdelete?.([], context);
    expect(diagnostics.map((entry) => entry.message)).toContain("kv_keys_missing");
    expect(diagnostics.map((entry) => entry.message)).toContain("kv_pairs_missing");
  });
});
