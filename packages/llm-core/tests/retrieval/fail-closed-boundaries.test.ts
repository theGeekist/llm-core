import { describe, expect, test } from "bun:test";
import type { VectorStore as LangChainVectorStore } from "@langchain/core/vectorstores";
import type { BaseQueryEngine } from "@llamaindex/core/query-engine";
import type { BaseSynthesizer } from "@llamaindex/core/response-synthesizers";
import { EngineResponse } from "@llamaindex/core/schema";
import type { BaseVectorStore } from "@llamaindex/core/vector-store";
import { collectStep, isPromiseLike, maybeToStep, type MaybeAsyncIterable } from "#shared/maybe";
import { createLangChainVectorStore } from "../../src/adapters/frameworks/langchain/retrieval/public";
import {
  createLlamaIndexQueryEngine,
  createLlamaIndexResponseSynthesizer,
  createLlamaIndexVectorStore,
} from "../../src/adapters/frameworks/llamaindex/retrieval/public";
import type { QueryStreamEvent } from "../../src/features/retrieval/public";
import { textDocument, textRetrievalQuery } from "../../src/features/retrieval/public";

const CONTEXT = {
  invocationId: "0190bd0c-0000-7000-8000-000000001415" as never,
};

const collect = async (value: MaybeAsyncIterable<QueryStreamEvent>) => {
  const maybeStep = maybeToStep(value);
  const step = isPromiseLike(maybeStep) ? await maybeStep : maybeStep;
  const items = collectStep(step);
  return isPromiseLike(items) ? await items : items;
};

const responseWith = (content: unknown, raw?: object, stream = false): EngineResponse => {
  const response = EngineResponse.fromResponse("placeholder", stream, []);
  response.message = { role: "assistant", content } as never;
  response.raw = raw ?? null;
  return response;
};

const responseStream = (response: EngineResponse): AsyncIterable<EngineResponse> => ({
  async *[Symbol.asyncIterator]() {
    yield response;
  },
});

describe("qualified retrieval adapters fail closed", () => {
  test("never projects nested LlamaIndex raw secrets or signed locators", async () => {
    const raw = {
      nested: {
        credential: "sk-sensitive",
        signedUrl: "https://storage.invalid/file?token=secret",
        token: "secret",
      },
    };
    const response = responseWith("safe", raw);
    const streamedResponse = responseWith("safe", raw, true);
    const engine = {
      query: async ({ stream }: { stream?: boolean }) =>
        stream ? responseStream(streamedResponse) : response,
    } as unknown as BaseQueryEngine;
    const adapter = createLlamaIndexQueryEngine(engine);

    const result = await adapter.query({ query: textRetrievalQuery("q") }, CONTEXT);
    const events = await collect(
      adapter.stream?.({ query: textRetrievalQuery("q") }, CONTEXT) ?? [],
    );
    const projection = JSON.stringify({ result, events });
    expect(result.extensions).toBeUndefined();
    expect(projection).not.toContain("sk-sensitive");
    expect(projection).not.toContain("signedUrl");
    expect(projection).not.toContain("token=secret");
  });

  test("rejects LlamaIndex namespaces before add or delete side effects", async () => {
    let adds = 0;
    let deletes = 0;
    const native = {
      add: async () => {
        adds += 1;
        return ["added"];
      },
      delete: async () => {
        deletes += 1;
      },
    } as unknown as BaseVectorStore;
    const adapter = createLlamaIndexVectorStore(native);

    expect(() =>
      adapter.upsert({ documents: [textDocument("doc")], namespace: "tenant-a" }, CONTEXT),
    ).toThrow("namespace isolation");
    expect(() =>
      adapter.upsert(
        { vectors: [{ id: "vector", values: [0.1, 0.2] }], namespace: "tenant-a" },
        CONTEXT,
      ),
    ).toThrow("namespace isolation");
    expect(() => adapter.delete({ ids: ["doc"], namespace: "tenant-a" }, CONTEXT)).toThrow(
      "namespace isolation",
    );
    expect(() =>
      adapter.delete({ filter: { stale: true }, namespace: "tenant-a" }, CONTEXT),
    ).toThrow("namespace isolation");
    expect({ adds, deletes }).toEqual({ adds: 0, deletes: 0 });
  });

  test("rejects an empty LangChain filter before native deletion", () => {
    let deletes = 0;
    const native = {
      delete: async () => {
        deletes += 1;
      },
    } as unknown as LangChainVectorStore;
    const adapter = createLangChainVectorStore(native);

    expect(() => adapter.delete({ filter: {} }, CONTEXT)).toThrow("non-empty filter");
    expect(deletes).toBe(0);
  });

  test("rejects mixed LlamaIndex query and synthesis responses", async () => {
    const mixed = responseWith([
      { type: "text", text: "partial" },
      { type: "image_url", image_url: { url: "https://signed.invalid/image?token=secret" } },
    ]);
    const engine = {
      query: async () => mixed,
    } as unknown as BaseQueryEngine;
    const synthesizer = {
      synthesize: async () => mixed,
    } as unknown as BaseSynthesizer;

    await expect(
      createLlamaIndexQueryEngine(engine).query({ query: textRetrievalQuery("q") }, CONTEXT),
    ).rejects.toThrow("unsupported non-text");
    await expect(
      createLlamaIndexResponseSynthesizer(synthesizer).synthesize(
        { query: textRetrievalQuery("q"), documents: [textDocument("source")] },
        CONTEXT,
      ),
    ).rejects.toThrow("unsupported non-text");
  });

  test("diagnoses mixed LlamaIndex query and synthesis stream content without projecting it", async () => {
    const mixed = responseWith([
      { type: "text", text: "partial" },
      { type: "file", data: "secret-binary", mimeType: "application/octet-stream" },
    ]);
    const stream = responseStream(mixed);
    const engine = {
      query: async () => stream,
    } as unknown as BaseQueryEngine;
    const synthesizer = {
      synthesize: async () => stream,
    } as unknown as BaseSynthesizer;

    const queryEvents = await collect(
      createLlamaIndexQueryEngine(engine).stream?.({ query: textRetrievalQuery("q") }, CONTEXT) ??
        [],
    );
    const synthesisEvents = await collect(
      createLlamaIndexResponseSynthesizer(synthesizer).stream?.(
        { query: textRetrievalQuery("q"), documents: [textDocument("source")] },
        CONTEXT,
      ) ?? [],
    );

    for (const events of [queryEvents, synthesisEvents]) {
      expect(events.map((event) => event.kind)).toEqual(["start", "error"]);
      expect(events[1]).toEqual({
        kind: "error",
        error: {
          severity: "error",
          code: "llamaindex-unsupported-response-content",
          message: "LlamaIndex returned unsupported non-text response content.",
          data: { cause: "unsupported-content" },
        },
      });
      expect(JSON.stringify(events)).not.toContain("secret-binary");
    }
  });
});
