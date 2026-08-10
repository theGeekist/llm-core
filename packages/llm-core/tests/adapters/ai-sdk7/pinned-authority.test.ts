import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import type { AiSdk7NativeEvent } from "../../../src/adapters/ai-sdk";

interface PinnedCaseResult {
  response: unknown;
  events: AiSdk7NativeEvent[];
}

describe("AI SDK 7.0.37 and Provider 4.0.3 pinned authority", () => {
  it("uses the official MockLanguageModelV4 and real generateText result classes", () => {
    const fixture = Bun.spawnSync({
      cmd: [
        process.execPath,
        fileURLToPath(new URL("./pinned-authority-case.ts", import.meta.url)),
      ],
      cwd: process.cwd(),
      stderr: "pipe",
      stdout: "pipe",
    });
    expect(fixture.exitCode).toBe(0);
    expect(fixture.stderr.toString()).toBe("");
    const { response, events } = JSON.parse(fixture.stdout.toString()) as PinnedCaseResult;

    expect(response).toMatchObject({
      kind: "completion",
      content: [{ kind: "json", value: { answer: 42 } }],
      warnings: [{ code: "ai-sdk.other", message: "pinned warning" }],
      metadata: { requestId: "pinned-response", modelId: "pinned-model" },
    });
    expect(events.find(({ kind }) => kind === "generate-result")?.value).toMatchObject({
      rawFinishReason: "provider-stop",
      request: { body: null, messages: null },
      responseMessages: [
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: '{"answer":42}',
              providerOptions: { pinned: { region: "sg" } },
            },
          ],
        },
      ],
    });
    expect(events.find(({ kind }) => kind === "step")?.value).toMatchObject({
      rawFinishReason: "provider-stop",
      request: { body: null, messages: null },
      response: {
        id: "pinned-response",
        headers: { "x-pinned": "true" },
        body: null,
      },
      providerMetadata: { pinned: { region: "sg" } },
      performance: expect.objectContaining({ stepTimeMs: expect.any(Number) }),
    });
    expect(events.find(({ kind }) => kind === "final-step")?.value).toEqual(
      events.find(({ kind }) => kind === "step")?.value,
    );
    expect(events.find(({ kind }) => kind === "structured-output")?.value).toEqual({ answer: 42 });
  });
});
