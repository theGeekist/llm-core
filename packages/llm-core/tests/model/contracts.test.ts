import { describe, expect, test } from "bun:test";
import { coreId, digest, nativeExtensions, newCoreId } from "#contracts";
import type { ResourceId, ToolCallId } from "#contracts";
import type {
  ModelContentPart,
  ModelRequest,
  ModelResponse,
  ProviderRequestMetadata,
} from "../../src/features/model/public";

const DIGEST = digest("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
const RESOURCE_ID = newCoreId<ResourceId>("0190bd0c-0000-7000-8000-000000000031");
const TOOL_CALL_ID = coreId<ToolCallId>("0190bd0c-0000-4000-8000-000000000041");

describe("model request/response representability", () => {
  test("content union covers text/json/binary/media-ref, reasoning, tool lifecycle", () => {
    const parts: ModelContentPart[] = [
      { kind: "text", text: "hello" },
      { kind: "json", value: { a: 1 } },
      {
        kind: "binary",
        mediaType: "application/octet-stream",
        encoding: "base64",
        data: "AAAA",
        byteLength: 3,
        digest: DIGEST,
      },
      {
        kind: "media-ref",
        mediaType: "image/png",
        resource: { resourceId: RESOURCE_ID, mediaType: "image/png", byteLength: 10, digest: DIGEST },
      },
      { kind: "reasoning", text: "because" },
      { kind: "tool-call", toolCallId: TOOL_CALL_ID, name: "search", arguments: { q: "x" } },
      { kind: "tool-result", toolCallId: TOOL_CALL_ID, result: [{ kind: "text", text: "ok" }] },
    ];
    expect(parts.map((part) => part.kind as string).sort()).toEqual(
      ["binary", "json", "media-ref", "reasoning", "text", "tool-call", "tool-result"].sort(),
    );
  });

  test("request carries tools, structured output, sampling and redacted extensions", () => {
    const metadata: ProviderRequestMetadata = {
      extensions: nativeExtensions({ "com.example.vendor": { trace: "redacted" } }),
    };
    const request: ModelRequest = {
      messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }],
      tools: [{ name: "search", parameters: { type: "object" } }],
      toolChoice: { kind: "required" },
      responseFormat: { kind: "json" },
      sampling: { temperature: 0.2, maxOutputTokens: 256, stopSequences: ["\n\n"] },
      metadata,
    };
    expect(request.responseFormat).toEqual({ kind: "json" });
    expect(request.metadata?.extensions?.["com.example.vendor"]).toEqual({ trace: "redacted" });
  });

  test("response models completion (usage/warnings/finish) and error variants", () => {
    const completion: ModelResponse = {
      kind: "completion",
      content: [{ kind: "text", text: "hi" }],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [{ code: "truncated", message: "output truncated", severity: "warning" }],
    };
    const failure: ModelResponse = {
      kind: "error",
      error: { code: "rate-limited", message: "slow down", retryable: true },
    };
    expect(completion.kind).toBe("completion");
    expect(failure.kind).toBe("error");
    if (failure.kind === "error") {
      expect(failure.error.retryable).toBe(true);
    }
  });
});
