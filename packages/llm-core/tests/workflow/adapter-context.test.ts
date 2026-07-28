import { describe, expect, it } from "bun:test";
import { attachAdapterContext, createAdapterContext } from "#workflow/adapter-context";
import type {
  AdapterBundle,
  AdapterCallContext,
  AdapterDiagnostic,
  ModelCall,
  ModelStreamEvent,
  QueryStreamEvent,
} from "#adapters";
import type { RetryConfig } from "#adapters";

const makeReporter = (bucket: AdapterDiagnostic[]) => ({
  report: (diagnostic: AdapterDiagnostic) => {
    bucket.push(diagnostic);
  },
});

const createEndStream =
  <TInput extends object>(onCall: () => void) =>
  (_input: TInput): AsyncIterable<QueryStreamEvent> => {
    void _input;
    onCall();
    return (async function* (): AsyncIterable<QueryStreamEvent> {
      yield { type: "end", timestamp: Date.now() };
    })();
  };

const createModelEndStream =
  (onCall?: () => void) =>
  (_call: ModelCall): AsyncIterable<ModelStreamEvent> => {
    void _call;
    onCall?.();
    return (async function* (): AsyncIterable<ModelStreamEvent> {
      yield { type: "end", timestamp: Date.now() };
    })();
  };

describe("Workflow adapter context wrappers", () => {
  it("injects the default context into adapter calls", async () => {
    const { context, diagnostics } = createAdapterContext();
    const adapters: AdapterBundle = {
      embedder: {
        embed: ({ context }) => {
          context?.report?.({ level: "warn", message: "embed" });
          return [0.1];
        },
        embedMany: ({ context }) => {
          context?.report?.({ level: "warn", message: "embedMany" });
          return [[0.1]];
        },
      },
      retriever: {
        retrieve: ({ context }) => {
          context?.report?.({ level: "warn", message: "retrieve" });
          return { documents: [] };
        },
      },
      image: {
        generate: ({ context }) => {
          context?.report?.({ level: "warn", message: "image" });
          return { images: [] };
        },
      },
      reranker: {
        rerank: ({ context }) => {
          context?.report?.({ level: "warn", message: "rerank" });
          return [];
        },
      },
      textSplitter: {
        split: ({ context }) => {
          context?.report?.({ level: "warn", message: "split" });
          return [];
        },
        splitBatch: ({ context }) => {
          context?.report?.({ level: "warn", message: "splitBatch" });
          return [];
        },
        splitWithMetadata: ({ context }) => {
          context?.report?.({ level: "warn", message: "splitWithMetadata" });
          return [{ text: "hi", metadata: {} }];
        },
      },
      transformer: {
        transform: ({ context }) => {
          context?.report?.({ level: "warn", message: "transform" });
          return [];
        },
      },
      indexing: {
        index: ({ context }) => {
          context?.report?.({ level: "warn", message: "index" });
          return { added: 0, deleted: 0, updated: 0, skipped: 0 };
        },
      },
      storage: {
        get: ({ context }) => {
          context?.report?.({ level: "warn", message: "get" });
          return null;
        },
        put: ({ context }) => {
          context?.report?.({ level: "warn", message: "put" });
          return null;
        },
        delete: ({ context }) => {
          context?.report?.({ level: "warn", message: "delete" });
          return null;
        },
        list: ({ context }) => {
          context?.report?.({ level: "warn", message: "list" });
          return [];
        },
      },
      kv: {
        mget: ({ context }) => {
          context?.report?.({ level: "warn", message: "mget" });
          return [];
        },
        mset: ({ context }) => {
          context?.report?.({ level: "warn", message: "mset" });
          return null;
        },
        mdelete: ({ context }) => {
          context?.report?.({ level: "warn", message: "mdelete" });
          return null;
        },
        list: ({ context }) => {
          context?.report?.({ level: "warn", message: "listKv" });
          return [];
        },
      },
      memory: {
        append: ({ context }) => {
          context?.report?.({ level: "warn", message: "append" });
          return null;
        },
        read: ({ context }) => {
          context?.report?.({ level: "warn", message: "read" });
          return null;
        },
        summarize: ({ context }) => {
          context?.report?.({ level: "warn", message: "summarize" });
          return "";
        },
        load: ({ context }) => {
          context?.report?.({ level: "warn", message: "load" });
          return {};
        },
        save: ({ context }) => {
          context?.report?.({ level: "warn", message: "save" });
          return null;
        },
        reset: ({ context }) => {
          context?.report?.({ level: "warn", message: "reset" });
          return null;
        },
      },
      speech: {
        generate: ({ context }) => {
          context?.report?.({ level: "warn", message: "speech" });
          return { audio: { bytes: new Uint8Array() } };
        },
      },
      transcription: {
        generate: ({ context }) => {
          context?.report?.({ level: "warn", message: "transcription" });
          return { text: "" };
        },
      },
      skills: {
        load: ({ context }) => {
          context?.report?.({ level: "warn", message: "skills" });
          return { skills: [] };
        },
      },
      tools: [
        {
          name: "tool",
          execute: ({ context }) => {
            context?.report?.({ level: "warn", message: "tool" });
            return "ok";
          },
        },
      ],
      vectorStore: {
        upsert: ({ context }) => {
          context?.report?.({ level: "warn", message: "upsert" });
          return { ids: [] };
        },
        delete: ({ context }) => {
          context?.report?.({ level: "warn", message: "vectorDelete" });
          return null;
        },
      },
    };

    const wrapped = attachAdapterContext({ adapters, context });

    await wrapped.embedder?.embed({ text: "hi" });
    await wrapped.embedder?.embedMany?.({ texts: ["hi"] });
    await wrapped.retriever?.retrieve({ query: "hi" });
    await wrapped.image?.generate({ prompt: "hi" });
    await wrapped.reranker?.rerank({ query: "hi", documents: [] });
    await wrapped.textSplitter?.split({ text: "hi" });
    await wrapped.textSplitter?.splitBatch?.({ texts: ["hi"] });
    await wrapped.textSplitter?.splitWithMetadata?.({ text: "hi" });
    await wrapped.transformer?.transform({ documents: [] });
    await wrapped.indexing?.index({ documents: [] });
    await wrapped.storage?.get({ key: "key" });
    await wrapped.storage?.put({ key: "key", blob: { bytes: new Uint8Array() } });
    await wrapped.storage?.delete({ key: "key" });
    await wrapped.storage?.list({ prefix: "" });
    await wrapped.kv?.mget({ keys: ["key"] });
    await wrapped.kv?.mset({ pairs: [["key", { ok: true }]] });
    await wrapped.kv?.mdelete({ keys: ["key"] });
    await wrapped.kv?.list({ prefix: "" });
    await wrapped.memory?.append?.({
      threadId: "thread",
      turn: { role: "user", content: "hi" },
    });
    await wrapped.memory?.read?.({ threadId: "thread" });
    await wrapped.memory?.summarize?.({ threadId: "thread" });
    await wrapped.memory?.load?.({ input: { input: "hi" } });
    await wrapped.memory?.save?.({
      input: { input: "hi" },
      output: { output: "ok" },
    });
    await wrapped.memory?.reset?.({});
    await wrapped.speech?.generate({ text: "hi" });
    await wrapped.transcription?.generate({ audio: { bytes: new Uint8Array() } });
    await wrapped.skills?.load({});
    await wrapped.tools?.[0]?.execute?.({ input: { ok: true } });
    await wrapped.vectorStore?.upsert({ documents: [] });
    await wrapped.vectorStore?.delete({ ids: [] });

    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it("honors an explicit AdapterCallContext override", async () => {
    const { context, diagnostics } = createAdapterContext();
    const overrideDiagnostics: AdapterDiagnostic[] = [];
    const overrideContext: AdapterCallContext = makeReporter(overrideDiagnostics);
    const adapters: AdapterBundle = {
      embedder: {
        embed: ({ context: requestContext }) => {
          requestContext?.report?.({ level: "warn", message: "embed" });
          return [0.2];
        },
      },
    };

    const wrapped = attachAdapterContext({ adapters, context });
    await wrapped.embedder?.embed({ text: "hi", context: overrideContext });

    expect(diagnostics).toHaveLength(0);
    expect(overrideDiagnostics[0]?.message).toBe("embed");
  });

  it("adds default context to Memory.save and reset requests", async () => {
    const { context } = createAdapterContext();
    const received: AdapterCallContext[] = [];
    const wrapped = attachAdapterContext({
      adapters: {
        memory: {
          save: ({ context: requestContext }) => {
            if (requestContext) {
              received.push(requestContext);
            }
            return true;
          },
          reset: ({ context: requestContext }) => {
            if (requestContext) {
              received.push(requestContext);
            }
            return true;
          },
        },
      },
      context,
    });

    await wrapped.memory?.save?.({
      input: { input: "hi" },
      output: { output: "ok" },
    });
    await wrapped.memory?.reset?.({});

    expect(received).toEqual([context, context]);
  });

  it("preserves absent optional fields while injecting context", async () => {
    const { context } = createAdapterContext();
    let cacheTtl: number | undefined = 42;
    let cacheContext: AdapterCallContext | undefined;
    let listPrefix: string | undefined = "unexpected";
    let listContext: AdapterCallContext | undefined;
    const wrapped = attachAdapterContext({
      adapters: {
        cache: {
          get: () => null,
          set: ({ ttlMs, context: requestContext }) => {
            cacheTtl = ttlMs;
            cacheContext = requestContext;
            return true;
          },
          delete: () => true,
        },
        storage: {
          get: () => null,
          put: () => true,
          delete: () => true,
          list: ({ prefix, context: requestContext }) => {
            listPrefix = prefix;
            listContext = requestContext;
            return [];
          },
        },
      },
      context,
    });

    await wrapped.cache?.set({ key: "key", value: { bytes: new Uint8Array() } });
    await wrapped.storage?.list({});

    expect(cacheTtl).toBeUndefined();
    expect(cacheContext).toBe(context);
    expect(listPrefix).toBeUndefined();
    expect(listContext).toBe(context);
  });

  it("retries adapter calls when retry policy is provided", async () => {
    const { context } = createAdapterContext();
    let attempts = 0;
    const adapters: AdapterBundle = {
      embedder: {
        embed: () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error("flaky");
          }
          return [0.42];
        },
      },
    };
    const retry: RetryConfig = {
      embedder: { maxAttempts: 3, backoffMs: 0 },
    };
    const wrapped = attachAdapterContext({ adapters, context, retry, trace: [] });
    const result = await wrapped.embedder?.embed({ text: "hi" });

    expect(result).toEqual([0.42]);
    expect(attempts).toBe(3);
  });

  it("uses adapter retry metadata when runtime config is missing", async () => {
    const { context } = createAdapterContext();
    let attempts = 0;
    const adapters: AdapterBundle = {
      embedder: {
        embed: () => {
          attempts += 1;
          if (attempts < 2) {
            throw new Error("flaky");
          }
          return [0.7];
        },
        metadata: {
          retry: { policy: { maxAttempts: 2, backoffMs: 0 } },
        },
      },
    };
    const wrapped = attachAdapterContext({ adapters, context });
    const result = await wrapped.embedder?.embed({ text: "hi" });

    expect(result).toEqual([0.7]);
    expect(attempts).toBe(2);
  });

  it("merges retry defaults with per-run overrides", async () => {
    const { context } = createAdapterContext();
    let attempts = 0;
    const adapters: AdapterBundle = {
      embedder: {
        embed: () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error("flaky");
          }
          return [0.9];
        },
      },
    };
    const retryDefaults: RetryConfig = {
      embedder: { maxAttempts: 2, backoffMs: 0 },
    };
    const retry: RetryConfig = {
      embedder: { maxAttempts: 3, backoffMs: 0 },
    };
    const wrapped = attachAdapterContext({
      adapters,
      context,
      retryDefaults,
      retry,
      trace: [],
    });
    const result = await wrapped.embedder?.embed({ text: "hi" });

    expect(result).toEqual([0.9]);
    expect(attempts).toBe(3);
  });

  it("keeps non-restartable streams unwrapped", () => {
    const { context } = createAdapterContext();
    const stream = createModelEndStream();
    const adapters: AdapterBundle = {
      model: {
        generate: () => ({ text: "ok" }),
        stream,
        metadata: { retry: { restartable: false } },
      },
    };

    const wrapped = attachAdapterContext({
      adapters,
      context,
      retry: { model: { maxAttempts: 2, backoffMs: 0 } },
      trace: [],
    });

    expect(wrapped.model?.stream).toBe(stream);
  });

  it("wraps restartable streams when retry policies exist", async () => {
    const { context } = createAdapterContext();
    let called = false;
    const stream = createModelEndStream(() => {
      called = true;
    });
    const adapters: AdapterBundle = {
      model: {
        generate: () => ({ text: "ok" }),
        stream,
        metadata: { retry: { restartable: true } },
      },
    };

    const wrapped = attachAdapterContext({
      adapters,
      context,
      retry: { model: { maxAttempts: 2, backoffMs: 0 } },
      trace: [],
    });

    expect(wrapped.model?.stream).not.toBe(stream);
    await wrapped.model?.stream?.({ prompt: "hello" });
    expect(called).toBe(true);
  });

  it("wraps output parsers and preserves format instructions", async () => {
    const { context } = createAdapterContext();
    const formatInstructions = () => "format";
    const adapters: AdapterBundle = {
      outputParser: {
        parse: ({ text }) => ({ input: text }),
        formatInstructions,
      },
    };

    const wrapped = attachAdapterContext({ adapters, context, trace: [] });
    const result = await wrapped.outputParser?.parse({ text: "hi" });

    expect(result).toEqual({ input: "hi" });
    expect(wrapped.outputParser?.formatInstructions).toBe(formatInstructions);
  });

  it("wraps query engine streams when restartable", async () => {
    const { context } = createAdapterContext();
    let streamed = false;
    const stream = createEndStream(() => {
      streamed = true;
    });
    const adapters: AdapterBundle = {
      queryEngine: {
        query: () => ({ text: "ok" }),
        stream,
        metadata: { retry: { restartable: true } },
      },
    };

    const wrapped = attachAdapterContext({
      adapters,
      context,
      retry: { queryEngine: { maxAttempts: 2, backoffMs: 0 } },
      trace: [],
    });

    expect(wrapped.queryEngine?.stream).not.toBe(stream);
    await wrapped.queryEngine?.stream?.({ query: "q" });
    expect(streamed).toBe(true);
  });

  it("wraps response synthesizer streams when restartable", async () => {
    const { context } = createAdapterContext();
    let streamed = false;
    const stream = createEndStream(() => {
      streamed = true;
    });
    const adapters: AdapterBundle = {
      responseSynthesizer: {
        synthesize: () => ({ text: "ok" }),
        stream,
        metadata: { retry: { restartable: true } },
      },
    };

    const wrapped = attachAdapterContext({
      adapters,
      context,
      retry: { responseSynthesizer: { maxAttempts: 2, backoffMs: 0 } },
      trace: [],
    });

    expect(wrapped.responseSynthesizer?.stream).not.toBe(stream);
    await wrapped.responseSynthesizer?.stream?.({ query: "q", documents: [] });
    expect(streamed).toBe(true);
  });
});
