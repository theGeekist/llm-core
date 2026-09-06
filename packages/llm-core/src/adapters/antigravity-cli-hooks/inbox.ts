import { isExternalId, isJsonValue, type JsonValue } from "#contracts";
import { isPortableRecord } from "#shared/portable-data";
import {
  AntigravityCliError,
  type AntigravityHookInbox,
  type AntigravityHookInboxEnvelope,
  type AntigravityHookInvocationProjection,
  type AntigravityHookProjectedInput,
  type AntigravityHookRefusedInput,
  type AntigravityPreparedHookResult,
} from "./protocol";

const formatEnvelopeContent = (content: JsonValue): string => {
  if (typeof content === "string") return content;
  if (isPortableRecord(content) && typeof content.text === "string") return content.text;
  return JSON.stringify(content);
};

const sameInput = (
  envelope: AntigravityHookInboxEnvelope,
  messageId: string,
  correlationId: string,
): boolean => envelope.messageId === messageId && envelope.correlationId === correlationId;

const isCanonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;

interface Claim {
  readonly conversationId: string;
  readonly boundary: AntigravityHookInvocationProjection["boundary"];
  readonly entries: readonly AntigravityHookInboxEnvelope[];
}

const EMPTY: readonly [] = Object.freeze([]);

const projected = (
  entries: readonly AntigravityHookInboxEnvelope[],
): readonly AntigravityHookProjectedInput[] =>
  Object.freeze(
    entries.map(({ messageId, correlationId }) => Object.freeze({ messageId, correlationId })),
  );

const refused = (
  entries: readonly AntigravityHookInboxEnvelope[],
): readonly AntigravityHookRefusedInput[] =>
  Object.freeze(
    entries.map(({ messageId, correlationId }) =>
      Object.freeze({ messageId, correlationId, reasonCode: "stop-boundary-refused" as const }),
    ),
  );

export const createAntigravityHookInbox = (): AntigravityHookInbox => {
  const pendingByConversation = new Map<string, AntigravityHookInboxEnvelope[]>();
  const correlationByMessage = new Map<string, string>();
  const claims = new Map<string, Claim>();
  const activeClaimByConversation = new Map<string, string>();
  let claimSequence = 0;

  return {
    write(envelope: AntigravityHookInboxEnvelope): void {
      if (
        !isExternalId(envelope.conversationId) ||
        !isExternalId(envelope.messageId) ||
        !isExternalId(envelope.correlationId) ||
        !isCanonicalTimestamp(envelope.submittedAt) ||
        !isJsonValue(envelope.content)
      ) {
        throw new TypeError(
          "Hook inbox envelope requires portable identity, content, and submission time.",
        );
      }
      if (correlationByMessage.has(envelope.messageId)) {
        throw new AntigravityCliError(
          "duplicate-input",
          `Message ${envelope.messageId} was already submitted to hook inbox.`,
        );
      }
      const activeClaimId = activeClaimByConversation.get(envelope.conversationId);
      const activeClaim = activeClaimId ? claims.get(activeClaimId) : undefined;
      if (activeClaim?.boundary === "Stop") {
        throw new AntigravityCliError(
          "stop-claim-active",
          "Hook inbox cannot accept input while a Stop claim is open.",
        );
      }
      correlationByMessage.set(envelope.messageId, envelope.correlationId);
      const queue = pendingByConversation.get(envelope.conversationId) ?? [];
      queue.push(Object.freeze({ ...envelope }));
      pendingByConversation.set(envelope.conversationId, queue);
    },

    remove(conversationId: string, messageId: string, correlationId: string): void {
      if (activeClaimByConversation.has(conversationId)) {
        throw new AntigravityCliError(
          "claim-active",
          "Hook inbox cannot remove input while a claim is open.",
        );
      }
      const queue = pendingByConversation.get(conversationId);
      if (!queue) return;
      const remaining = queue.filter((envelope) => !sameInput(envelope, messageId, correlationId));
      if (remaining.length === queue.length) return;
      correlationByMessage.delete(messageId);
      pendingByConversation.set(conversationId, remaining);
    },

    prepare(invocation: AntigravityHookInvocationProjection): AntigravityPreparedHookResult {
      const conversationId = invocation.input.conversationId;
      if (activeClaimByConversation.has(conversationId)) {
        throw new AntigravityCliError(
          "claim-active",
          "Hook inbox conversation already has a prepared claim.",
        );
      }
      const entries = Object.freeze([...(pendingByConversation.get(conversationId) ?? [])]);
      const claimId = `antigravity-hook-claim:${++claimSequence}`;
      claims.set(claimId, { conversationId, boundary: invocation.boundary, entries });
      activeClaimByConversation.set(conversationId, claimId);
      let state: "open" | "finalised" = "open";

      const finalise = (operation: "commit" | "release"): void => {
        if (state !== "open") {
          throw new AntigravityCliError(
            "claim-finalised",
            "Hook inbox claim is already finalised.",
          );
        }
        const claim = claims.get(claimId);
        if (!claim) throw new AntigravityCliError("claim-missing", "Hook inbox claim is missing.");
        if (operation === "commit") {
          const claimedMessages = new Set(claim.entries.map(({ messageId }) => messageId));
          const queue = pendingByConversation.get(claim.conversationId) ?? [];
          pendingByConversation.set(
            claim.conversationId,
            queue.filter(({ messageId }) => !claimedMessages.has(messageId)),
          );
        }
        claims.delete(claimId);
        activeClaimByConversation.delete(claim.conversationId);
        state = "finalised";
      };

      const commit = () => finalise("commit");
      const release = () => finalise("release");
      if (invocation.boundary === "Stop") {
        return Object.freeze({
          boundary: "Stop",
          claimId,
          output: Object.freeze({ decision: "stop" as const }),
          projectedInputs: EMPTY,
          refusedInputs: refused(entries),
          commit,
          release,
        });
      }

      const projectedInputs = projected(entries);
      const injectSteps = Object.freeze(
        entries.map((envelope) =>
          Object.freeze({ userMessage: formatEnvelopeContent(envelope.content) }),
        ),
      );
      if (invocation.boundary === "PostInvocation") {
        return Object.freeze({
          boundary: "PostInvocation",
          claimId,
          ...(entries.length
            ? {
                output: Object.freeze({
                  injectSteps,
                  terminationBehavior: "force_continue" as const,
                }),
              }
            : {}),
          projectedInputs,
          refusedInputs: EMPTY,
          commit,
          release,
        });
      }
      return Object.freeze({
        boundary: "PreInvocation",
        claimId,
        ...(entries.length ? { output: Object.freeze({ injectSteps }) } : {}),
        projectedInputs,
        refusedInputs: EMPTY,
        commit,
        release,
      });
    },
  };
};
