import { describe, expect, test } from "bun:test";
import {
  interactionAgentEvent,
  interactionExecutionEvent,
  createInteractionProjection,
  reduceInteractionProjection,
} from "../../../src/application/interaction/public";
import type { ExecutionEvent } from "../../../src/features/evidence/public";
import { coreId, type EvidenceId, type ToolCallId } from "#contracts";
import { AGENT, CONVERSATION_ID, NOW, RUN_ID, agentEvent, eventId } from "./helpers";

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
    } as unknown as ExecutionEvent;

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
});
