import { describe, expect, test } from "bun:test";
import { interactionAgentEvent } from "../../../src/application/interaction/public";
import {
  createAiSdkUiProjectionMapper,
  createAssistantUiProjectionMapper,
  createChatKitProjectionMapper,
  createNluxProjectionMapper,
} from "../../../src/adapters/ui/public";
import {
  AGENT,
  CONVERSATION_ID,
  RUN_ID,
  agentEvent,
} from "../../application/interaction/helpers";

const started = interactionAgentEvent(
  CONVERSATION_ID,
  agentEvent("agent.run.started", 0, {
    agentId: AGENT.agentId,
    agentVersion: AGENT.version,
  }),
);
const progress = interactionAgentEvent(
  CONVERSATION_ID,
  agentEvent("agent.run.progress", 1, { code: "thinking" }),
);
const completed = interactionAgentEvent(
  CONVERSATION_ID,
  agentEvent("agent.run.completed", 2, { status: "completed" }),
);
const failed = interactionAgentEvent(
  CONVERSATION_ID,
  agentEvent("agent.run.failed", 3, {
    status: "failed",
    reasonCode: "provider-unavailable",
  }),
);

describe("canonical UI projections", () => {
  test("maps runner lifecycle into AI SDK UI structural chunks", () => {
    const map = createAiSdkUiProjectionMapper();

    expect(map(started).map((chunk) => chunk.type)).toEqual([
      "start",
      "data-llm-core-status",
    ]);
    expect(map(completed)).toEqual([
      {
        type: "data-llm-core-status",
        data: { kind: "run-finished", runId: RUN_ID, status: "completed" },
      },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  test("retains assistant-ui status messages without importing framework types", () => {
    const map = createAssistantUiProjectionMapper({
      includeProgress: true,
      prefix: "Status: ",
    });

    expect(map(progress)).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "Status: thinking" }],
        },
      },
    ]);
  });

  test("maps ChatKit start, error and end events", () => {
    const map = createChatKitProjectionMapper();

    expect(map(started)).toEqual([{ type: "chatkit.response.start" }]);
    expect(map(failed)).toEqual([
      { type: "chatkit.error", detail: { code: "provider-unavailable" } },
      { type: "chatkit.response.end" },
    ]);
  });

  test("maps NLUX progress and terminal observer signals", () => {
    const map = createNluxProjectionMapper();

    expect(map(progress)).toEqual([{ type: "next", chunk: "thinking" }]);
    expect(map(completed)).toEqual([{ type: "complete" }]);
    expect(map(failed)).toEqual([{ type: "error", code: "provider-unavailable" }]);
  });
});
