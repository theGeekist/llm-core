import { describe, expect, it, mock } from "bun:test";
import type { AdapterTraceEvent } from "#adapters";
import { fromLlamaIndexModel, toAdapterTrace } from "#adapters";
import { makeUsage, asLlamaIndexModel } from "./helpers";

describe("Adapter telemetry trace", () => {
  it("prefers totalUsage when both usage and totalUsage are present", async () => {
    mock.module("ai", () => ({
      generateText: () => ({
        text: "ok",
        usage: makeUsage(1, 2),
        totalUsage: makeUsage(10, 20),
      }),
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const adapter = fromAiSdkModel({} as never);
    const result = await adapter.generate({ prompt: "hi" });

    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });
    mock.restore();
  });

  it("keeps single usage when only usage is present", async () => {
    mock.module("ai", () => ({
      generateText: () => ({
        text: "ok",
        usage: makeUsage(2, 3),
      }),
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const adapter = fromAiSdkModel({} as never);
    const result = await adapter.generate({ prompt: "hi" });

    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 3, totalTokens: 5 });
    mock.restore();
  });

  it("warns when usage is unavailable", async () => {
    mock.module("ai", () => ({
      generateText: () => ({
        text: "ok",
      }),
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const adapter = fromAiSdkModel({} as never);
    const result = await adapter.generate({ prompt: "hi" });

    expect(result.diagnostics?.map((entry) => entry.message)).toContain("usage_unavailable");
    mock.restore();
  });

  it("exposes single usage when LlamaIndex returns usage", async () => {
    const model = asLlamaIndexModel({
      metadata: { model: "llama" },
      chat: () =>
        Promise.resolve({
          message: { role: "assistant", content: "ok" },
          raw: { usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 } },
        }),
    });

    const adapter = fromLlamaIndexModel(model);
    const result = await adapter.generate({ prompt: "hi" });

    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 4, totalTokens: 7 });
  });

  it("emits provider.response as the first trace event", () => {
    const trace = toAdapterTrace({
      response: { id: "req-1", modelId: "model-1", timestamp: 1700000000000 },
    });

    expect(trace?.[0]?.name).toBe("provider.response");
  });

  it("keeps earlier events intact when appending provider trace events", () => {
    const initial: AdapterTraceEvent[] = [{ name: "run.start", timestamp: 1, data: { ok: true } }];
    const merged =
      toAdapterTrace(
        {
          response: { id: "req-2", modelId: "model-2", timestamp: 1700000000001 },
        },
        initial,
      ) ?? [];

    expect(merged[0]).toEqual(initial[0]);
    expect(merged[1]?.name).toBe("provider.response");
  });
});
