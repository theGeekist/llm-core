import { describe, expect, test } from "bun:test";
import {
  coreId,
  digest,
  secretRef,
  type JsonValue,
  type ResourceId,
  type ToolCallId,
} from "#contracts";
import {
  registerConversationRecord,
  registerConversationTurn,
} from "../../src/features/memory/public";
import { conversationId } from "../storage/helpers";

describe("conversation contracts", () => {
  test("reconstructs closed deeply frozen model content", () => {
    const source: {
      conversationId: typeof conversationId;
      revision: number;
      turns: Array<{
        role: "user";
        content: Array<{ kind: "text"; text: string }>;
        occurredAt: string;
      }>;
    } = {
      conversationId,
      revision: 1,
      turns: [
        {
          role: "user",
          content: [{ kind: "text", text: "hello" }],
          occurredAt: "2026-07-29T10:30:00.000Z",
        },
      ],
    };
    const record = registerConversationRecord(source);
    source.turns[0]!.content[0]!.text = "changed";

    expect(record.turns[0]?.content).toEqual([{ kind: "text", text: "hello" }]);
    expect(Object.isFrozen(record.turns[0]?.content)).toBe(true);
  });

  test("accepts references and tool lifecycle without inline bytes", () => {
    const toolCallId = coreId<ToolCallId>("0190bd0c-0000-4000-8000-000000000104");
    const resourceId = coreId<ResourceId>("0190bd0c-0000-4000-8000-000000000105");
    const sha = digest("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
    const turn = registerConversationTurn({
      role: "assistant",
      content: [
        { kind: "tool-call", toolCallId, name: "lookup", arguments: { query: "safe" } },
        {
          kind: "tool-result",
          toolCallId,
          result: [
            {
              kind: "media-ref",
              mediaType: "image/png",
              resource: { resourceId, mediaType: "image/png", byteLength: 3, digest: sha },
            },
          ],
        },
      ],
    });
    expect(turn.content.map((part) => part.kind)).toEqual(["tool-call", "tool-result"]);
  });

  test("accepts exact closed opaque references at every JSON boundary", () => {
    const toolCallId = coreId<ToolCallId>("0190bd0c-0000-4000-8000-000000000104");
    const resourceId = coreId<ResourceId>("0190bd0c-0000-4000-8000-000000000105");
    const value = {
      opaqueReferences: [
        secretRef("sk-reference-not-material"),
        {
          resourceId,
          mediaType: "image/png",
          byteLength: 3,
          digest: digest("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"),
        },
      ],
    };

    expect(
      registerConversationTurn({
        role: "assistant",
        content: [
          { kind: "json", value },
          { kind: "tool-call", toolCallId, name: "lookup", arguments: value },
          {
            kind: "tool-result",
            toolCallId,
            result: [{ kind: "json", value }],
          },
        ],
      }).content.map((part) => part.kind),
    ).toEqual(["json", "tool-call", "tool-result"]);
  });

  test("rejects binary, native metadata, locators and non-canonical identity", () => {
    expect(() =>
      registerConversationTurn({
        role: "user",
        content: [
          {
            kind: "binary",
            mediaType: "application/octet-stream",
            encoding: "base64",
            data: "AAAA",
            byteLength: 3,
            digest: digest("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"),
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      registerConversationTurn({
        role: "user",
        content: [{ kind: "text", text: "safe", signedUrl: "https://secret" }],
      }),
    ).toThrow();
    expect(() =>
      registerConversationRecord({
        conversationId: "thread-1",
        revision: 0,
        turns: [],
        providerMetadata: { credential: "secret" },
      }),
    ).toThrow();
  });

  test("rejects sensitive JSON content, tool arguments and tool results recursively", () => {
    const toolCallId = coreId<ToolCallId>("0190bd0c-0000-4000-8000-000000000104");
    const sensitiveValues: JsonValue[] = [
      { nested: [{ userAuthorizationValue: "placeholder" }] },
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- benign rejection fixture
      { nested: [{ userPasswordValue: "placeholder" }] },
      { nested: [{ applicationSecretValue: "placeholder" }] },
      { nested: [{ session_cookie_value: "placeholder" }] },
    ];

    for (const value of sensitiveValues) {
      expect(() =>
        registerConversationTurn({
          role: "assistant",
          content: [{ kind: "json", value }],
        }),
      ).toThrow();
      expect(() =>
        registerConversationTurn({
          role: "assistant",
          content: [{ kind: "tool-call", toolCallId, name: "unsafe", arguments: value }],
        }),
      ).toThrow();
      expect(() =>
        registerConversationTurn({
          role: "assistant",
          content: [
            {
              kind: "tool-result",
              toolCallId,
              result: [{ kind: "json", value }],
            },
          ],
        }),
      ).toThrow();
    }
  });

  test("rejects malformed opaque-reference lookalikes at every JSON boundary", () => {
    const toolCallId = coreId<ToolCallId>("0190bd0c-0000-4000-8000-000000000104");
    const resourceId = coreId<ResourceId>("0190bd0c-0000-4000-8000-000000000105");
    const resourceRef = {
      resourceId,
      mediaType: "image/png",
      byteLength: 3,
      digest: digest("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"),
    };
    const lookalikes: JsonValue[] = [
      { ...resourceRef, digest: "not-a-digest" },
      { ...resourceRef, extra: "placeholder" },
      { ...resourceRef, resourceId: "not-a-resource-id" },
      { ...resourceRef, byteLength: "3" },
      { secretId: "" },
      { secretId: 42 },
      { secretId: "sk-reference-not-material", extra: "placeholder" },
    ];

    for (const lookalike of lookalikes) {
      const value = { nested: [lookalike] };
      expect(() =>
        registerConversationTurn({
          role: "assistant",
          content: [{ kind: "json", value }],
        }),
      ).toThrow();
      expect(() =>
        registerConversationTurn({
          role: "assistant",
          content: [{ kind: "tool-call", toolCallId, name: "unsafe", arguments: value }],
        }),
      ).toThrow();
      expect(() =>
        registerConversationTurn({
          role: "assistant",
          content: [
            {
              kind: "tool-result",
              toolCallId,
              result: [{ kind: "json", value }],
            },
          ],
        }),
      ).toThrow();
    }
  });
});
