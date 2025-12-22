import { describe, expect, it, mock } from "bun:test";
import { z } from "zod";
import { Tool, toAdapterSchema } from "#adapters";

describe("Adapter AI SDK model", () => {
  it("maps named tool choice to a tool selector", async () => {
    let captured: Record<string, unknown> | undefined;

    mock.module("ai", () => ({
      generateText: (options: Record<string, unknown>) => {
        captured = options;
        return { text: "ok" };
      },
      jsonSchema: (schema: unknown) => schema,
      zodSchema: (schema: unknown) => schema,
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    await model.generate({
      prompt: "hi",
      tools: [Tool.create({ name: "search" })],
      toolChoice: "search",
    });

    expect(captured?.toolChoice).toEqual({ type: "tool", toolName: "search" });
    mock.restore();
  });

  it("prefers messages over prompt even when empty", async () => {
    let captured: Record<string, unknown> | undefined;

    mock.module("ai", () => ({
      generateText: (options: Record<string, unknown>) => {
        captured = options;
        return { text: "ok" };
      },
      jsonSchema: (schema: unknown) => schema,
      zodSchema: (schema: unknown) => schema,
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    await model.generate({
      prompt: "ignored",
      messages: [],
    });

    expect(captured?.messages).toEqual([]);
    expect("prompt" in (captured ?? {})).toBe(false);
    mock.restore();
  });

  it("emits provider warnings from AI SDK telemetry", async () => {
    mock.module("ai", () => ({
      generateText: () => ({
        text: "ok",
        warnings: [{ note: "warn" }],
      }),
      jsonSchema: (schema: unknown) => schema,
      zodSchema: (schema: unknown) => schema,
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    const result = await model.generate({ prompt: "hi" });

    expect(result.diagnostics?.map((entry) => entry.message)).toContain("provider_warning");
    mock.restore();
  });

  it("uses zod schemas for structured outputs", async () => {
    let captured: Record<string, unknown> | undefined;

    mock.module("ai", () => ({
      generateObject: (options: Record<string, unknown>) => {
        captured = options;
        return { object: { ok: true } };
      },
      jsonSchema: () => ({ kind: "json" }),
      zodSchema: () => ({ kind: "zod" }),
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    await model.generate({
      prompt: "hi",
      responseSchema: toAdapterSchema(z.object({ ok: z.boolean() })),
    });

    expect(captured?.schema).toEqual({ kind: "zod" });
    mock.restore();
  });

  it("uses json schemas for non-zod structured outputs", async () => {
    let captured: Record<string, unknown> | undefined;

    mock.module("ai", () => ({
      generateObject: (options: Record<string, unknown>) => {
        captured = options;
        return { object: { ok: true } };
      },
      jsonSchema: () => ({ kind: "json" }),
      zodSchema: () => ({ kind: "zod" }),
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    await model.generate({
      prompt: "hi",
      responseSchema: toAdapterSchema({ type: "object", properties: {} }),
    });

    expect(captured?.schema).toEqual({ kind: "json" });
    mock.restore();
  });
});
