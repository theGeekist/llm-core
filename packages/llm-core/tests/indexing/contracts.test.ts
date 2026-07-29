import { describe, expect, test } from "bun:test";
import { newCoreId, type InvocationContext, type InvocationId } from "#contracts";
import type { Indexer, VectorStore } from "../../src/features/indexing/public";
import { textDocument } from "../../src/features/retrieval/public";

const context: InvocationContext = {
  invocationId: newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000001413"),
};

describe("indexing feature front", () => {
  test("keeps indexing input portable and context separate", async () => {
    const seen: InvocationContext[] = [];
    const indexer: Indexer = {
      index: ({ documents }, invocation) => {
        seen.push(invocation);
        return { added: documents.length, deleted: 0, updated: 0, skipped: 0 };
      },
    };

    const result = await indexer.index({ documents: [textDocument("one")] }, context);
    expect(result).toEqual({ added: 1, deleted: 0, updated: 0, skipped: 0 });
    expect(seen).toEqual([context]);
  });

  test("preserves document and vector upsert, id and filter delete semantics", async () => {
    const calls: string[] = [];
    const store: VectorStore = {
      info: { dimension: 2, namespace: "test" },
      upsert: (request) => {
        calls.push("documents" in request ? "documents" : "vectors");
        return { ids: ["stored"] };
      },
      delete: (request) => {
        calls.push("ids" in request ? "ids" : "filter");
        return true;
      },
    };

    await store.upsert({ documents: [textDocument("one")] }, context);
    await store.upsert({ vectors: [{ id: "v1", values: [0.1, 0.2] }] }, context);
    await store.delete({ ids: ["v1"] }, context);
    await store.delete({ filter: { status: "stale" } }, context);
    expect(calls).toEqual(["documents", "vectors", "ids", "filter"]);
    expect(store.info?.dimension).toBe(2);
  });
});
