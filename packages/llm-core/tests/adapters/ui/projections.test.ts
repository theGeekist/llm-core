import { describe, expect, test } from "bun:test";
import {
  interactionContentEvent,
  type InteractionSession,
} from "../../../src/application/interaction/public";
import {
  createAiSdkUiProjectionMapper,
  createAssistantUiProjectionMapper,
  createChatKitProjectionMapper,
  createNluxChatAdapter,
  createNluxProjectionMapper,
} from "../../../src/adapters/ui/public";
import {
  CONVERSATION_ID,
  INVOCATION_ID,
  RUN_ID,
  contentEvent,
} from "../../application/interaction/interaction-run-fixtures";

const content = (
  kind: Parameters<typeof contentEvent>[0],
  sequence: number,
  facts: Parameters<typeof contentEvent>[2],
) => interactionContentEvent(CONVERSATION_ID, contentEvent(kind, sequence, facts));

const started = content("interaction.message.started", 0, { messageId: "message-1" });
const text = content("interaction.message.text.delta", 1, {
  messageId: "message-1",
  text: "Hello ",
});
const reasoning = content("interaction.message.reasoning.delta", 2, {
  messageId: "message-1",
  text: "because",
});
const toolCall = content("interaction.message.tool.call", 3, {
  messageId: "message-1",
  toolCallId: "tool-call-1",
  toolName: "lookup",
  projectedInput: { query: "[redacted]" },
});
const toolResult = content("interaction.message.tool.result", 4, {
  messageId: "message-1",
  toolCallId: "tool-call-1",
  toolName: "lookup",
  projectedResult: { answer: "safe" },
  isError: false,
});
const completed = content("interaction.message.completed", 5, {
  messageId: "message-1",
});
const failed = content("interaction.message.failed", 5, {
  messageId: "message-1",
  reasonCode: "provider-unavailable",
});

describe("canonical UI projections", () => {
  test("conforms to AI SDK UI text, reasoning and tool chunk contracts", () => {
    const map = createAiSdkUiProjectionMapper();

    expect(map(started)).toEqual([{ type: "start", messageId: "message-1" }]);
    expect(map(text)).toEqual([
      { type: "text-start", id: "message-1:text" },
      { type: "text-delta", id: "message-1:text", delta: "Hello " },
    ]);
    expect(map(reasoning)).toEqual([
      { type: "reasoning-start", id: "message-1:reasoning" },
      { type: "reasoning-delta", id: "message-1:reasoning", delta: "because" },
    ]);
    expect(map(toolCall)).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "tool-call-1",
        toolName: "lookup",
        input: { query: "[redacted]" },
      },
    ]);
    expect(map(toolResult)).toEqual([
      {
        type: "tool-output-available",
        toolCallId: "tool-call-1",
        output: { answer: "safe" },
      },
    ]);
    expect(map(completed)).toEqual([
      { type: "text-end", id: "message-1:text" },
      { type: "reasoning-end", id: "message-1:reasoning" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  test("buffers assistant-ui text and emits native tool-result commands", () => {
    const map = createAssistantUiProjectionMapper({
      includeReasoning: true,
      reasoningPrefix: "Reasoning: ",
    });

    map(started);
    map(text);
    map(reasoning);
    expect(map(toolResult)).toEqual([
      {
        type: "add-tool-result",
        toolCallId: "tool-call-1",
        toolName: "lookup",
        result: { answer: "safe" },
        isError: false,
      },
    ]);
    expect(map(completed)).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [
            { type: "text", text: "Hello " },
            { type: "text", text: "Reasoning: because" },
          ],
        },
      },
    ]);
  });

  test("creates actual ChatKit CustomEvents with the installed error detail", () => {
    const map = createChatKitProjectionMapper();

    const startEvents = map(started);
    const errorEvents = map(failed);

    expect(startEvents[0]).toBeInstanceOf(CustomEvent);
    expect(startEvents[0]?.type).toBe("chatkit.response.start");
    expect(errorEvents.map((event) => event.type)).toEqual([
      "chatkit.error",
      "chatkit.response.end",
    ]);
    expect((errorEvents[0] as CustomEvent<{ error: Error }>).detail.error).toBeInstanceOf(Error);
  });

  test("maps NLUX text and terminal callbacks with Error objects", () => {
    const map = createNluxProjectionMapper();

    expect(map(text)).toEqual([{ type: "next", chunk: "Hello " }]);
    expect(map(completed)).toEqual([{ type: "complete" }]);
    const errorSignal = map(failed)[0];
    expect(errorSignal?.type).toBe("error");
    if (errorSignal?.type === "error") {
      expect(errorSignal.error).toBeInstanceOf(Error);
      expect(errorSignal.error.message).toBe("provider-unavailable");
    }
  });

  test("streams canonical content through the installed NLUX ChatAdapter contract", async () => {
    const events = [started, text, completed];
    const session = {
      send: async () => ({
        async *events() {
          for (const event of events) {
            yield event;
          }
        },
        result: async () => ({
          conversationId: CONVERSATION_ID,
          run: { identity: { runId: RUN_ID }, status: "completed" },
        }),
      }),
    } as unknown as InteractionSession;
    const adapter = createNluxChatAdapter({
      session,
      invocationContext: () => ({ invocationId: INVOCATION_ID }),
    });
    const chunks: string[] = [];
    const finished = new Promise<void>((resolve, reject) => {
      adapter.streamText?.(
        "hello",
        {
          next: (chunk) => chunks.push(chunk),
          complete: resolve,
          error: reject,
        },
        {} as never,
      );
    });

    await finished;
    expect(chunks).toEqual(["Hello "]);
  });
});
