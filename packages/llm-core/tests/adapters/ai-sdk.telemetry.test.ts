import { describe, expect, it } from "bun:test";
import { toDiagnostics, toMeta, toTelemetry } from "../../src/adapters/ai-sdk/telemetry.ts";

describe("Adapter AI SDK telemetry", () => {
  it("maps telemetry payloads and warnings", () => {
    const telemetry = toTelemetry({
      request: { body: { prompt: "hi" } },
      response: {
        id: "req-1",
        modelId: "model-1",
        timestamp: new Date(123456),
        headers: { "x-test": "ok" },
        body: { ok: true },
      },
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      warnings: [{ note: "warn" }],
      providerMetadata: { region: "test" },
    });

    expect(telemetry.request?.body).toEqual({ prompt: "hi" });
    expect(telemetry.response?.id).toBe("req-1");
    expect(telemetry.response?.modelId).toBe("model-1");
    expect(telemetry.response?.timestamp).toBe(123456);
    expect(telemetry.response?.headers).toEqual({ "x-test": "ok" });
    expect(telemetry.response?.body).toEqual({ ok: true });
    expect(telemetry.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
    expect(telemetry.warnings?.[0]?.message).toBe("provider_warning");
    expect(telemetry.providerMetadata).toEqual({ region: "test" });
  });

  it("maps meta identifiers", () => {
    const meta = toMeta({ modelId: "model-2", id: "req-2" });
    expect(meta.provider).toBe("ai-sdk");
    expect(meta.modelId).toBe("model-2");
    expect(meta.requestId).toBe("req-2");
  });

  it("defaults to empty diagnostics when warnings are missing", () => {
    expect(toDiagnostics()).toEqual([]);
  });
});
