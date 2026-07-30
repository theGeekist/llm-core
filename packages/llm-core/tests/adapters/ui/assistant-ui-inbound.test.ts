import { describe, expect, test } from "bun:test";
import { coreId, newCoreId, type EventId, type RunId } from "#contracts";
import { parseAssistantUiInboundEvents } from "../../../src/adapters/ui/assistant-ui";

const RUN_ID = coreId<RunId>("00000000-0000-4000-8000-000000000001");

const context = () => {
  let id = 10;
  return {
    runId: RUN_ID,
    newEventId: () =>
      newCoreId<EventId>(`00000000-0000-7000-8000-${String(id++).padStart(12, "0")}`),
    newMessageId: () => `message-${id}`,
    now: () => "2026-07-30T00:00:00.000Z",
    redactText: (text: string) => ({
      text: text.replaceAll(/secret/gi, "[redacted]"),
      redaction: text.includes("secret")
        ? { kind: "redacted" as const, categories: ["credentials" as const] }
        : { kind: "not-required" as const },
    }),
    projectToolResult: (value: unknown) => ({
      value: value as never,
      redaction: { kind: "not-required" as const },
    }),
  };
};

describe("Assistant UI canonical inbound validation", () => {
  test("rejects UUIDv4 values returned by the event identity factory", () => {
    expect(
      parseAssistantUiInboundEvents(
        {
          commands: [
            {
              type: "add-message",
              message: { role: "user", parts: [{ type: "text", text: "hello" }] },
            },
          ],
        },
        {
          ...context(),
          newEventId: () => coreId<EventId>("00000000-0000-4000-8000-000000000002"),
        },
      ),
    ).toBeNull();
  });

  test("registers redacted text as canonical ordered interaction events", () => {
    const events = parseAssistantUiInboundEvents(
      {
        commands: [
          {
            type: "add-message",
            message: {
              role: "user",
              parts: [{ type: "text", text: "my secret" }],
            },
          },
        ],
      },
      context(),
    );

    expect(events?.map((event) => event.kind)).toEqual([
      "interaction.message.started",
      "interaction.message.text.delta",
      "interaction.message.completed",
    ]);
    expect(events?.[1]).toMatchObject({
      sequence: 1,
      facts: { text: "my [redacted]" },
      redaction: { kind: "redacted", categories: ["credentials"] },
    });
    expect(Object.isFrozen(events?.[1])).toBe(true);
  });

  test("rejects unsupported image parts instead of silently dropping them", () => {
    expect(
      parseAssistantUiInboundEvents(
        {
          commands: [
            {
              type: "add-message",
              message: {
                role: "user",
                parts: [{ type: "image", image: "data:image/png;base64,secret" }],
              },
            },
          ],
        },
        context(),
      ),
    ).toBeNull();
  });

  test("rejects framework-native data instead of silently dropping it", () => {
    expect(
      parseAssistantUiInboundEvents(
        {
          commands: [],
          data: { apiKey: "secret" },
        },
        context(),
      ),
    ).toBeNull();
  });

  test("rejects sensitive projected tool data and unprojected artifacts", () => {
    expect(
      parseAssistantUiInboundEvents(
        {
          commands: [
            {
              type: "add-tool-result",
              toolCallId: "call-1",
              toolName: "lookup",
              result: { apiKey: "secret" },
              isError: false,
            },
          ],
        },
        context(),
      ),
    ).toBeNull();
    expect(
      parseAssistantUiInboundEvents(
        {
          commands: [
            {
              type: "add-tool-result",
              toolCallId: "call-1",
              toolName: "lookup",
              result: { answer: 42 },
              isError: false,
              artifact: { providerPayload: true },
            },
          ],
        },
        context(),
      ),
    ).toBeNull();
  });
});
