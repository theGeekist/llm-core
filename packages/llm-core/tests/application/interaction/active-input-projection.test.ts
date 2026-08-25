import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  externalId,
  newCoreId,
  type CorrelationId,
  type EventId,
} from "#contracts";
import type { AgentEvent } from "../../../src/features/agent/public";
import {
  createInteractionProjection,
  interactionAgentEvent,
  reduceInteractionProjection,
} from "../../../src/application/interaction/public";
import { CONVERSATION_ID, RUN_ID } from "./interaction-run-fixtures";

const NOW = "2026-08-25T02:00:00.000Z";
const CORRELATION_ID = externalId<CorrelationId>("correlation:projection");

const event = (
  kind: AgentEvent["kind"],
  sequence: number,
  facts: AgentEvent["facts"],
): AgentEvent =>
  ({
    eventId: newCoreId<EventId>(
      `018f0f4e-8c5b-7a91-8c3b-${String(sequence + 200).padStart(12, "0")}`,
    ),
    kind,
    occurredAt: NOW,
    sequence,
    identity: { runId: RUN_ID },
    facts,
  }) as AgentEvent;

describe("active-input interaction projection", () => {
  test("keeps acceptance, recipient observation and unavailable processing distinct", () => {
    const source = [
      event("agent.run.started", 0, {
        agentId: "agent",
        agentVersion: contractVersion("2.0.0"),
      }),
      event("agent.run.input.accepted", 1, {
        messageId: "message:projection",
        correlationId: CORRELATION_ID,
        acceptedAt: NOW,
        deliveryMode: "execution-boundary",
      }),
      event("agent.run.input.recipient-observed", 2, {
        messageId: "message:projection",
        correlationId: CORRELATION_ID,
        observedAt: NOW,
        evidenceRef: "evidence:recipient-observed",
      }),
      event("agent.run.input.evidence-unavailable", 3, {
        messageId: "message:projection",
        correlationId: CORRELATION_ID,
        stage: "semantic-processing",
        declaredAt: NOW,
        reasonCode: "provider-unobservable",
      }),
      event("agent.run.input.processing-observed", 4, {
        messageId: "message:projection",
        correlationId: CORRELATION_ID,
        observedAt: NOW,
        causationRef: "provider-event:processed-input",
      }),
    ].map((item) => interactionAgentEvent(CONVERSATION_ID, item));

    const projection = source.reduce(
      reduceInteractionProjection,
      createInteractionProjection(CONVERSATION_ID),
    );
    expect(projection.events.map(({ kind }) => kind)).toEqual([
      "run-started",
      "active-input-accepted",
      "active-input-recipient-observed",
      "active-input-evidence-unavailable",
      "active-input-processing-observed",
    ]);
    expect(projection.status).toBe("running");
    expect(projection.acceptedActiveInputs).toEqual([
      {
        runId: RUN_ID,
        messageId: "message:projection",
        correlationId: CORRELATION_ID,
      },
    ]);
  });

  test("requires exact prior acceptance and rejects identity reuse", () => {
    const started = reduceInteractionProjection(
      createInteractionProjection(CONVERSATION_ID),
      interactionAgentEvent(
        CONVERSATION_ID,
        event("agent.run.started", 0, {
          agentId: "agent",
          agentVersion: contractVersion("2.0.0"),
        }),
      ),
    );
    const processingBeforeAcceptance = interactionAgentEvent(
      CONVERSATION_ID,
      event("agent.run.input.processing-observed", 1, {
        messageId: "message:projection",
        correlationId: CORRELATION_ID,
        observedAt: NOW,
        causationRef: "provider-event:processed-input",
      }),
    );
    expect(() => reduceInteractionProjection(started, processingBeforeAcceptance)).toThrow(
      "exact prior accepted message and correlation",
    );

    const accepted = reduceInteractionProjection(
      started,
      interactionAgentEvent(
        CONVERSATION_ID,
        event("agent.run.input.accepted", 1, {
          messageId: "message:projection",
          correlationId: CORRELATION_ID,
          acceptedAt: NOW,
          deliveryMode: "native-live",
        }),
      ),
    );
    const wrongEvidence = [
      event("agent.run.input.recipient-observed", 2, {
        messageId: "message:wrong",
        correlationId: CORRELATION_ID,
        observedAt: NOW,
        evidenceRef: "evidence:wrong-message",
      }),
      event("agent.run.input.processing-observed", 2, {
        messageId: "message:projection",
        correlationId: externalId<CorrelationId>("correlation:wrong"),
        observedAt: NOW,
        causationRef: "provider-event:wrong-correlation",
      }),
      event("agent.run.input.evidence-unavailable", 2, {
        messageId: "message:arbitrary",
        correlationId: externalId<CorrelationId>("correlation:arbitrary"),
        stage: "semantic-processing",
        declaredAt: NOW,
        reasonCode: "provider-unobservable",
      }),
    ];
    for (const source of wrongEvidence) {
      expect(() =>
        reduceInteractionProjection(accepted, interactionAgentEvent(CONVERSATION_ID, source)),
      ).toThrow("exact prior accepted message and correlation");
    }

    for (const duplicate of [
      event("agent.run.input.accepted", 2, {
        messageId: "message:projection",
        correlationId: externalId<CorrelationId>("correlation:other"),
        acceptedAt: NOW,
        deliveryMode: "native-live",
      }),
      event("agent.run.input.accepted", 2, {
        messageId: "message:other",
        correlationId: CORRELATION_ID,
        acceptedAt: NOW,
        deliveryMode: "native-live",
      }),
    ]) {
      expect(() =>
        reduceInteractionProjection(accepted, interactionAgentEvent(CONVERSATION_ID, duplicate)),
      ).toThrow("cannot reuse");
    }

    const processed = reduceInteractionProjection(
      accepted,
      interactionAgentEvent(
        CONVERSATION_ID,
        event("agent.run.input.processing-observed", 2, {
          messageId: "message:projection",
          correlationId: CORRELATION_ID,
          observedAt: NOW,
          causationRef: "provider-event:processed-input",
        }),
      ),
    );
    expect(processed.events.at(-1)).toEqual(
      expect.objectContaining({ kind: "active-input-processing-observed" }),
    );
  });
});
