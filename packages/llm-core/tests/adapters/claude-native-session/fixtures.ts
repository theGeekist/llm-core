import {
  contractVersion,
  externalId,
  newCoreId,
  type ConversationId,
  type CorrelationId,
  type EventId,
  type JsonValue,
  type PrincipalId,
  type RunId,
} from "#contracts";
import { admitAgentActiveInput } from "../../../src/agent/runtime";
import {
  createClaudeNativeSessionRunner,
  type ClaudeNativeSessionClient,
  type ClaudeNativeSessionCommand,
  type ClaudeNativeSessionProcess,
  type ClaudeStreamEvent,
} from "../../../src/adapters/claude-native-session/public";

export const NOW = "2026-09-05T10:00:00.000Z";
export const SESSION_ID = "claude-session:abc123";
const RUN_ID = newCoreId<RunId>("0198f0f4-8c5b-7a91-8c3b-123456789e01");
const EVENT_ID = newCoreId<EventId>("0198f0f4-8c5b-7a91-8c3b-123456789e02");
const CONVERSATION_ID = newCoreId<ConversationId>("0198f0f4-8c5b-7a91-8c3b-123456789e04");

export const fixtureClient = (
  eventsToEmit: readonly ClaudeStreamEvent[],
  sessionId = SESSION_ID,
): {
  client: ClaudeNativeSessionClient;
  spawnedCommands: ClaudeNativeSessionCommand[];
  cancelledCommands: ClaudeNativeSessionCommand[];
} => {
  const spawnedCommands: ClaudeNativeSessionCommand[] = [];
  const cancelledCommands: ClaudeNativeSessionCommand[] = [];
  const client: ClaudeNativeSessionClient = {
    spawn: (command: ClaudeNativeSessionCommand): ClaudeNativeSessionProcess => {
      spawnedCommands.push(command);
      let isCancelled = false;
      return {
        sessionId: command.sessionId ?? sessionId,
        events: (async function* () {
          yield {
            type: "system",
            subtype: "init",
            session_id: command.sessionId ?? sessionId,
          } as ClaudeStreamEvent;
          for (const event of eventsToEmit) {
            if (isCancelled) break;
            yield event;
          }
        })(),
        cancel: () => {
          isCancelled = true;
          cancelledCommands.push(command);
        },
      };
    },
  };
  return { client, spawnedCommands, cancelledCommands };
};

export const runnerWith = (
  client: ClaudeNativeSessionClient,
  observedEvents: ClaudeStreamEvent[] = [],
) =>
  createClaudeNativeSessionRunner({
    client,
    identity: { runId: () => RUN_ID, eventId: () => EVENT_ID, now: () => NOW },
    output: { projectAgentText: ({ text }) => text.replaceAll("secret", "[redacted]") },
    nativeEvents: { observe: ({ event }) => void observedEvents.push(event) },
  });

export const preparedRequest = async (
  runner: ReturnType<typeof runnerWith>,
  providerSession?: JsonValue,
) => ({
  agent: await runner.prepare({
    agentId: "agent.claude-native-test",
    version: contractVersion("1.0.0"),
    instructions: "Exercise the Claude native-session adapter.",
    effectRequirement: "read-only" as const,
  }),
  invocationContext: { invocationId: "0198f0f4-8c5b-7a91-8c3b-123456789e03" as never },
  input: { kind: "text", text: "Return fixture output." },
  ...(providerSession ? { providerSession: providerSession as never } : {}),
});

export const admittedInputFixture = async (messageId: string, text: string) => {
  const issuer = externalId<PrincipalId>("aifsd.application");
  const admission = await admitAgentActiveInput({
    request: {
      messageId,
      correlationId: externalId<CorrelationId>(`correlation:${messageId}`),
      submittedAt: NOW,
      content: text,
    },
    authority: {
      kind: "agent-active-input-authority",
      authorityId: `authority:${messageId}`,
      issuer,
      scope: { operation: "run.input.submit", conversationId: CONVERSATION_ID, runId: RUN_ID },
      revision: 1,
      issuedAt: "2026-09-05T09:00:00.000Z",
      expiresAt: "2026-09-05T11:00:00.000Z",
    },
    conversationId: CONVERSATION_ID,
    runId: RUN_ID,
    clock: { now: () => NOW },
    verifier: { verify: () => ({ status: "verified", issuer, revision: 1 }) },
  });
  if (admission.status !== "admitted") throw new Error("Fixture admission failed");
  return admission.input;
};
