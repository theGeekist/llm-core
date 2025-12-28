import { describe, expect, it } from "bun:test";
import { attachAdapterContext, createAdapterContext } from "#workflow/adapter-context";
import type {
  AdapterBundle,
  AdapterCallContext,
  AdapterDiagnostic,
  ImageCall,
  ModelCall,
  ModelStreamEvent,
  QueryStreamEvent,
  SpeechCall,
  TranscriptionCall,
} from "#adapters";
import type { RetryConfig } from "#adapters";

const makeReporter = (bucket: AdapterDiagnostic[]) => ({
  report: (diagnostic: AdapterDiagnostic) => {
    bucket.push(diagnostic);
  },
});

const createEndStream =
  <TInput>(onCall: () => void) =>
  (_input: TInput, _context?: AdapterCallContext): AsyncIterable<QueryStreamEvent> => {
    void _input;
    void _context;
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
        embed: (_text, ctx) => {
          ctx?.report?.({ level: "warn", message: "embed" });
          return [0.1];
        },
        embedMany: (_texts, ctx) => {
          ctx?.report?.({ level: "warn", message: "embedMany" });
          return [[0.1]];
        },
      },
      retriever: {
        retrieve: (_query, ctx) => {
          ctx?.report?.({ level: "warn", message: "retrieve" });
          return { documents: [] };
        },
      },
      image: {
        generate: (_call: ImageCall, ctx?: AdapterCallContext) => {
          ctx?.report?.({ level: "warn", message: "image" });
          return { images: [] };
        },
      },
      reranker: {
        rerank: (_query, _documents, ctx) => {
          ctx?.report?.({ level: "warn", message: "rerank" });
          return [];
        },
      },
      textSplitter: {
        split: (_text, ctx) => {
          ctx?.report?.({ level: "warn", message: "split" });
          return [];
        },
        splitBatch: (_texts, ctx) => {
          ctx?.report?.({ level: "warn", message: "splitBatch" });
          return [];
        },
        splitWithMetadata: (_input, ctx) => {
          ctx?.report?.({ level: "warn", message: "splitWithMetadata" });
          return [{ text: "hi", metadata: {} }];
        },
      },
      transformer: {
        transform: (_docs, ctx) => {
          ctx?.report?.({ level: "warn", message: "transform" });
          return [];
        },
      },
      storage: {
        get: (_key, ctx) => {
          ctx?.report?.({ level: "warn", message: "get" });
          return undefined;
        },
        put: (_key, _value, ctx) => {
          ctx?.report?.({ level: "warn", message: "put" });
          return null;
        },
        delete: (_key, ctx) => {
          ctx?.report?.({ level: "warn", message: "delete" });
          return null;
        },
        list: (_prefix, ctx) => {
          ctx?.report?.({ level: "warn", message: "list" });
          return [];
        },
      },
      kv: {
        mget: (_keys, ctx) => {
          ctx?.report?.({ level: "warn", message: "mget" });
          return [];
        },
        mset: (_pairs, ctx) => {
          ctx?.report?.({ level: "warn", message: "mset" });
          return null;
        },
        mdelete: (_keys, ctx) => {
          ctx?.report?.({ level: "warn", message: "mdelete" });
          return null;
        },
        list: (_prefix, ctx) => {
          ctx?.report?.({ level: "warn", message: "listKv" });
          return [];
        },
      },
      memory: {
        append: (_threadId, _turn, ctx) => {
          ctx?.report?.({ level: "warn", message: "append" });
          return null;
        },
        read: (_threadId, ctx) => {
          ctx?.report?.({ level: "warn", message: "read" });
          return undefined;
        },
        summarize: (_threadId, ctx) => {
          ctx?.report?.({ level: "warn", message: "summarize" });
          return "";
        },
        load: (_input, ctx) => {
          ctx?.report?.({ level: "warn", message: "load" });
          return {};
        },
        save: (_input, _output, ctx) => {
          ctx?.report?.({ level: "warn", message: "save" });
          return null;
        },
        reset: (ctx) => {
          ctx?.report?.({ level: "warn", message: "reset" });
          return null;
        },
      },
      speech: {
        generate: (_call: SpeechCall, ctx?: AdapterCallContext) => {
          ctx?.report?.({ level: "warn", message: "speech" });
          return { audio: { bytes: new Uint8Array() } };
        },
      },
      transcription: {
        generate: (_call: TranscriptionCall, ctx?: AdapterCallContext) => {
          ctx?.report?.({ level: "warn", message: "transcription" });
          return { text: "" };
        },
      },
      tools: [
        {
          name: "tool",
          execute: (_input, ctx) => {
            ctx?.report?.({ level: "warn", message: "tool" });
            return "ok";
          },
        },
      ],
      vectorStore: {
        upsert: (_input, ctx) => {
          ctx?.report?.({ level: "warn", message: "upsert" });
          return { ids: [] };
        },
        delete: (_input, ctx) => {
          ctx?.report?.({ level: "warn", message: "vectorDelete" });
          return null;
        },
      },
    };

    const wrapped = attachAdapterContext(adapters, context);

    await wrapped.embedder?.embed("hi");
    await wrapped.embedder?.embedMany?.(["hi"]);
    await wrapped.retriever?.retrieve("hi");
    await wrapped.image?.generate({ prompt: "hi" });
    await wrapped.reranker?.rerank("hi", []);
    await wrapped.textSplitter?.split("hi");
    await wrapped.textSplitter?.splitBatch?.(["hi"]);
    await wrapped.textSplitter?.splitWithMetadata?.("hi");
    await wrapped.transformer?.transform([]);
    await wrapped.storage?.get("key");
    await wrapped.storage?.put("key", { bytes: new Uint8Array() });
    await wrapped.storage?.delete("key");
    await wrapped.storage?.list("");
    await wrapped.kv?.mget(["key"]);
    await wrapped.kv?.mset([["key", { ok: true }]]);
    await wrapped.kv?.mdelete(["key"]);
    await wrapped.kv?.list("");
    await wrapped.memory?.append?.("thread", { role: "user", content: "hi" });
    await wrapped.memory?.read?.("thread");
    await wrapped.memory?.summarize?.("thread");
    await wrapped.memory?.load?.({ input: "hi" });
    await wrapped.memory?.save?.({ input: "hi" }, { output: "ok" });
    await wrapped.memory?.reset?.();
    await wrapped.speech?.generate({ text: "hi" });
    await wrapped.transcription?.generate({ audio: { bytes: new Uint8Array() } });
    await wrapped.tools?.[0]?.execute?.({ ok: true });
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
        embed: (_text, ctx) => {
          ctx?.report?.({ level: "warn", message: "embed" });
          return [0.2];
        },
      },
    };

    const wrapped = attachAdapterContext(adapters, context);
    await wrapped.embedder?.embed("hi", overrideContext);

    expect(diagnostics).toHaveLength(0);
    expect(overrideDiagnostics[0]?.message).toBe("embed");
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
    const wrapped = attachAdapterContext(adapters, context, { retry, trace: [] });
    const result = await wrapped.embedder?.embed("hi");

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
    const wrapped = attachAdapterContext(adapters, context);
    const result = await wrapped.embedder?.embed("hi");

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
    const wrapped = attachAdapterContext(adapters, context, { retryDefaults, retry, trace: [] });
    const result = await wrapped.embedder?.embed("hi");

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

    const wrapped = attachAdapterContext(adapters, context, {
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

    const wrapped = attachAdapterContext(adapters, context, {
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
        parse: (input) => ({ input }),
        formatInstructions,
      },
    };

    const wrapped = attachAdapterContext(adapters, context, { trace: [] });
    const result = await wrapped.outputParser?.parse("hi");

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

    const wrapped = attachAdapterContext(adapters, context, {
      retry: { queryEngine: { maxAttempts: 2, backoffMs: 0 } },
      trace: [],
    });

    expect(wrapped.queryEngine?.stream).not.toBe(stream);
    await wrapped.queryEngine?.stream?.("q");
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

    const wrapped = attachAdapterContext(adapters, context, {
      retry: { responseSynthesizer: { maxAttempts: 2, backoffMs: 0 } },
      trace: [],
    });

    expect(wrapped.responseSynthesizer?.stream).not.toBe(stream);
    await wrapped.responseSynthesizer?.stream?.({ query: "q", documents: [] });
    expect(streamed).toBe(true);
  });
});
