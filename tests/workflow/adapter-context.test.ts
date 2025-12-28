import { describe, expect, it } from "bun:test";
import { attachAdapterContext, createAdapterContext } from "#workflow/adapter-context";
import type {
  AdapterBundle,
  AdapterCallContext,
  AdapterDiagnostic,
  ImageCall,
  SpeechCall,
  TranscriptionCall,
} from "#adapters";

const makeReporter = (bucket: AdapterDiagnostic[]) => ({
  report: (diagnostic: AdapterDiagnostic) => {
    bucket.push(diagnostic);
  },
});

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
});
