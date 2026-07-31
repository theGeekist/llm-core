import { describe, expect, test } from "bun:test";
import {
  interactionAgentEvent,
  interactionContentEvent,
  interactionExecutionEvent,
  createInteractionProjection,
  registerInteractionContentEvent,
  reduceInteractionProjection,
} from "../../../src/application/interaction/public";
import type { ToolExecutionEvent } from "../../../src/features/evidence/public";
import { coreId, type EvidenceId, type ToolCallId } from "#contracts";
import { AGENT, CONVERSATION_ID, NOW, RUN_ID, agentEvent, contentEvent, eventId } from "./helpers";

describe("interaction event projection", () => {
  test("reduces canonical runner facts idempotently", () => {
    const started = interactionAgentEvent(
      CONVERSATION_ID,
      agentEvent("agent.run.started", 0, {
        agentId: "agent",
        agentVersion: AGENT.version,
      }),
    );
    const first = reduceInteractionProjection(
      createInteractionProjection(CONVERSATION_ID),
      started,
    );
    const duplicate = reduceInteractionProjection(first, started);

    expect(first.status).toBe("running");
    expect(first.events).toEqual([
      {
        kind: "run-started",
        eventId: started.event.eventId,
        runId: RUN_ID,
        agentId: "agent",
      },
    ]);
    expect(duplicate).toBe(first);
  });

  test("rejects an event ID reused for different facts", () => {
    const started = interactionAgentEvent(
      CONVERSATION_ID,
      agentEvent("agent.run.started", 0, {
        agentId: "agent",
        agentVersion: AGENT.version,
      }),
    );
    const state = reduceInteractionProjection(
      createInteractionProjection(CONVERSATION_ID),
      started,
    );
    const collision = interactionAgentEvent(
      CONVERSATION_ID,
      agentEvent("agent.run.progress", 0, { code: "different-fact" }),
    );

    expect(() => reduceInteractionProjection(state, collision)).toThrow("conflicting facts");
  });

  test("whitelists redacted execution facts and drops undeclared sensitive fields", () => {
    const source = {
      eventId: eventId("e10"),
      kind: "tool.execution.settled",
      occurredAt: NOW,
      sequence: 1,
      runId: RUN_ID,
      toolCallId: coreId<ToolCallId>("018f0f4e-8c5b-7a91-8c3b-123456789d20"),
      facts: {
        receiptId: coreId<EvidenceId>("018f0f4e-8c5b-7a91-8c3b-123456789d21"),
        receiptRevision: 2,
        receiptState: "succeeded",
        effectDisposition: "applied",
        actionDigest: {
          algorithm: "hmac-sha256",
          keyRef: "key:1",
          value: "safe-digest",
        },
        reasonCode: "ok",
        credential: "sk-must-not-project",
      },
      redaction: { kind: "redacted", categories: ["arguments", "result"] },
      secret: "signed-url",
    } as unknown as ToolExecutionEvent;

    const projected = interactionExecutionEvent(CONVERSATION_ID, source);
    const encoded = JSON.stringify(projected);
    const state = reduceInteractionProjection(
      createInteractionProjection(CONVERSATION_ID),
      projected,
    );

    expect(encoded).not.toContain("sk-must-not-project");
    expect(encoded).not.toContain("signed-url");
    expect(state.events[0]).toMatchObject({
      kind: "tool-status",
      receiptState: "succeeded",
      reasonCode: "ok",
    });
    expect(Object.isFrozen(projected)).toBe(true);
  });

  test("rejects sequence regression and every event after terminal closure", () => {
    const initial = createInteractionProjection(CONVERSATION_ID);
    const started = interactionAgentEvent(
      CONVERSATION_ID,
      agentEvent("agent.run.started", 1, {
        agentId: AGENT.agentId,
        agentVersion: AGENT.version,
      }),
    );
    const running = reduceInteractionProjection(initial, started);
    const regressed = interactionAgentEvent(
      CONVERSATION_ID,
      agentEvent("agent.run.progress", 0, { code: "late" }),
    );
    expect(() => reduceInteractionProjection(running, regressed)).toThrow("monotonically");

    const terminal = interactionAgentEvent(
      CONVERSATION_ID,
      agentEvent("agent.run.completed", 2, { status: "completed" }),
    );
    const completed = reduceInteractionProjection(running, terminal);
    const reopened = interactionAgentEvent(
      CONVERSATION_ID,
      agentEvent("agent.run.started", 3, {
        agentId: AGENT.agentId,
        agentVersion: AGENT.version,
      }),
    );
    expect(() => reduceInteractionProjection(completed, reopened)).toThrow(
      "cannot follow a terminal",
    );
  });

  test("closes completed and failed content messages against later deltas", () => {
    for (const kind of ["interaction.message.completed", "interaction.message.failed"] as const) {
      const initial = createInteractionProjection(CONVERSATION_ID);
      const started = interactionContentEvent(
        CONVERSATION_ID,
        contentEvent("interaction.message.started", 0, {
          messageId: `message:${kind}`,
        }),
      );
      const terminal = interactionContentEvent(
        CONVERSATION_ID,
        contentEvent(
          kind,
          1,
          kind === "interaction.message.completed"
            ? { messageId: `message:${kind}` }
            : { messageId: `message:${kind}`, reasonCode: "content-failed" },
        ),
      );
      const running = reduceInteractionProjection(initial, started);
      const closed = reduceInteractionProjection(running, terminal);
      const late = interactionContentEvent(
        CONVERSATION_ID,
        contentEvent("interaction.message.text.delta", 2, {
          messageId: `message:${kind}`,
          text: "late",
        }),
      );

      expect(() => reduceInteractionProjection(closed, late)).toThrow("terminal message");
    }
  });

  test("enforces the canonical content message and tool-call state machine", () => {
    const initial = createInteractionProjection(CONVERSATION_ID);
    const started = interactionContentEvent(
      CONVERSATION_ID,
      contentEvent("interaction.message.started", 0, {
        messageId: "message:state-machine",
      }),
    );
    const delta = interactionContentEvent(
      CONVERSATION_ID,
      contentEvent("interaction.message.text.delta", 1, {
        messageId: "message:state-machine",
        text: "hello",
      }),
    );
    const toolResult = interactionContentEvent(
      CONVERSATION_ID,
      contentEvent("interaction.message.tool.result", 2, {
        messageId: "message:state-machine",
        toolCallId: "tool-call:1",
        toolName: "lookup",
        projectedResult: { ok: true },
        isError: false,
      }),
    );

    expect(() => reduceInteractionProjection(initial, delta)).toThrow("preceding start");
    const running = reduceInteractionProjection(initial, started);
    const duplicateStart = interactionContentEvent(
      CONVERSATION_ID,
      contentEvent("interaction.message.started", 1, {
        messageId: "message:state-machine",
      }),
    );
    expect(() => reduceInteractionProjection(running, duplicateStart)).toThrow(
      "start exactly once",
    );
    expect(() => reduceInteractionProjection(running, toolResult)).toThrow("preceding tool call");
  });

  test("rejects run termination while a projected content message is open", () => {
    const started = interactionContentEvent(
      CONVERSATION_ID,
      contentEvent("interaction.message.started", 0, {
        messageId: "message:open",
      }),
    );
    const delta = interactionContentEvent(
      CONVERSATION_ID,
      contentEvent("interaction.message.text.delta", 1, {
        messageId: "message:open",
        text: "unfinished",
      }),
    );
    const terminal = interactionAgentEvent(
      CONVERSATION_ID,
      agentEvent("agent.run.completed", 2, { status: "completed" }),
    );
    const running = reduceInteractionProjection(
      reduceInteractionProjection(createInteractionProjection(CONVERSATION_ID), started),
      delta,
    );

    expect(() => reduceInteractionProjection(running, terminal)).toThrow("message remains open");
  });

  test("requires content events to pass the closed registration boundary", () => {
    const raw = {
      eventId: eventId("f20"),
      kind: "interaction.message.started",
      occurredAt: NOW,
      sequence: 0,
      runId: RUN_ID,
      facts: { messageId: "message:raw" },
      redaction: { kind: "not-required" },
    };

    expect(() => interactionContentEvent(CONVERSATION_ID, raw as never)).toThrow("registered");
    expect(() =>
      registerInteractionContentEvent({
        ...raw,
        credential: "sk-secret",
      }),
    ).toThrow("canonical identity");
    expect(() =>
      registerInteractionContentEvent({
        ...raw,
        facts: { messageId: "message:raw", reasonCode: "secret value" },
      }),
    ).toThrow("closed canonical shape");
    expect(() =>
      registerInteractionContentEvent({
        ...raw,
        eventId: eventId("f21"),
        kind: "interaction.message.tool.call",
        facts: {
          messageId: "message:raw",
          toolCallId: "tool-call:raw",
          toolName: "lookup",
          projectedInput: { credential: "sk-must-not-project" },
        },
      }),
    ).toThrow("closed canonical shape");
  });
});
