import { describe, expect, test } from "bun:test";
import { contractVersion } from "#contracts";
import {
  isRegisteredNativeAgentConversationProfile,
  nativeAgentOperation,
  registerAgentActiveInputAcknowledgement,
  registerAgentActiveInputProcessingEvidence,
  registerAgentActiveInputRequest,
  registerNativeAgentConversationProfile,
} from "../../src/features/agent/public";

const profile = () =>
  registerNativeAgentConversationProfile({
    providerId: "provider.codex",
    routeProfileId: "codex.app-server",
    routeProfileVersion: contractVersion("1.0.0"),
    sourceContract: {
      authority: "Codex app-server",
      version: "0.148.0-alpha.9",
      revision: "codex-app-server-0.148.0-alpha.9",
    },
    operations: [
      {
        operation: "conversation.start",
        disposition: "supported",
        evidenceRefs: ["fixture:conversation-start"],
      },
      {
        operation: "conversation.continue",
        disposition: "supported",
        evidenceRefs: ["fixture:conversation-continue"],
      },
      {
        operation: "run.observe",
        disposition: "supported",
        evidenceRefs: ["fixture:run-observe"],
      },
      {
        operation: "run.input.submit",
        disposition: "supported",
        evidenceRefs: ["fixture:turn-steer"],
        deliveryMode: "native-live",
      },
      {
        operation: "run.cancel",
        disposition: "unsupported",
        reasonCode: "not-implemented",
      },
    ],
  });

describe("native-agent conversation contract", () => {
  test("registers one exact disposition for every portable operation", () => {
    const registered = profile();

    expect(isRegisteredNativeAgentConversationProfile(registered)).toBe(true);
    expect(registered.operations.map(({ operation }) => operation)).toEqual([
      "conversation.start",
      "conversation.continue",
      "run.observe",
      "run.input.submit",
      "run.cancel",
    ]);
    expect(nativeAgentOperation(registered, "run.input.submit")).toEqual({
      operation: "run.input.submit",
      disposition: "supported",
      evidenceRefs: ["fixture:turn-steer"],
      deliveryMode: "native-live",
    });
    expect(JSON.parse(JSON.stringify(registered))).toEqual(registered);
    expect(Object.isFrozen(registered.operations[0])).toBe(true);
  });

  test("rejects missing operations, delivery modes on unlike operations and weak not-applicable claims", () => {
    const registered = profile();
    const missing = structuredClone(registered) as unknown as Record<string, unknown>;
    (missing.operations as unknown[]).pop();
    expect(() => registerNativeAgentConversationProfile(missing)).toThrow(
      "every portable operation",
    );

    const misplaced = structuredClone(registered) as unknown as {
      operations: Record<string, unknown>[];
    };
    misplaced.operations[0]!.deliveryMode = "native-live";
    expect(() => registerNativeAgentConversationProfile(misplaced)).toThrow(
      "every portable operation",
    );

    const weak = structuredClone(registered) as unknown as {
      operations: Record<string, unknown>[];
    };
    weak.operations[4] = {
      operation: "run.cancel",
      disposition: "not-applicable",
      evidenceRefs: [],
    };
    expect(() => registerNativeAgentConversationProfile(weak)).toThrow("every portable operation");
  });

  test("keeps provider acceptance separate from later processing evidence", () => {
    const request = registerAgentActiveInputRequest({
      messageId: "message:one",
      correlationId: "correlation:one",
      submittedAt: "2026-08-25T02:00:00.000Z",
      content: { kind: "text", text: "Check the authentication result too." },
    });
    const acknowledgement = registerAgentActiveInputAcknowledgement(
      {
        status: "accepted",
        messageId: request.messageId,
        correlationId: request.correlationId,
        acknowledgedAt: "2026-08-25T02:00:00.100Z",
      },
      request,
    );
    const unavailable = registerAgentActiveInputProcessingEvidence(
      {
        status: "unavailable",
        messageId: request.messageId,
        correlationId: request.correlationId,
        stage: "semantic-processing",
        declaredAt: "2026-08-25T02:00:00.200Z",
        reasonCode: "provider-unobservable",
      },
      request,
    );

    expect(acknowledgement.status).toBe("accepted");
    expect(unavailable).toEqual(
      expect.objectContaining({ status: "unavailable", stage: "semantic-processing" }),
    );
    expect(() =>
      registerAgentActiveInputProcessingEvidence(
        { ...unavailable, correlationId: "correlation:other" },
        request,
      ),
    ).toThrow("requested message and correlation");
    expect(() =>
      registerAgentActiveInputProcessingEvidence(
        { ...unavailable, messageId: "message:other" },
        request,
      ),
    ).toThrow("requested message and correlation");
  });
});
