import {
  coreId,
  externalId,
  isJsonValue,
  type EventId,
  type JsonValue,
  type ProviderSessionId,
  type RunId,
} from "#contracts";
import {
  createAgentTextOutput,
  createPreparedAgentDefinition,
  isAdmittedAgentActiveInput,
  registerAgentActiveInputAcknowledgement,
  registerAgentActiveInputProcessingEvidence,
  type AdmittedAgentActiveInput,
  type AgentCancellationRequest,
  type AgentDefinition,
  type AgentEvent,
  type AgentActiveInputIdentity,
  type AgentCancellationAcknowledgement,
  type AgentInterventionAcknowledgement,
  type AgentResult,
  type AgentStartRequest,
  type NativeAgentRun,
  type NativeAgentRunner,
  type PreparedAgentDefinition,
} from "../../features/agent/public";
import { createProviderSessionRef, type InterventionDecision } from "../../features/state/public";
import type { MaybePromise } from "#shared/maybe";
import { codexAppServerConversationProfile } from "./profile";
import type { CodexAppServerClient, CodexAppServerNotification } from "./protocol";

export interface CodexAppServerIdentity {
  runId(): RunId;
  eventId(): EventId;
  now(): string;
}

export interface CodexAppServerRunnerOptions {
  readonly client: CodexAppServerClient;
  readonly identity: CodexAppServerIdentity;
  readonly output: CodexAppServerOutputProjector;
}

export interface CodexAppServerOutputProjector {
  projectAgentText(input: {
    readonly providerId: "provider.codex";
    readonly routeProfileId: "codex.app-server.coordinator-owned";
    readonly threadId: string;
    readonly turnId: string;
    readonly text: string;
  }): MaybePromise<string | undefined>;
}

const record = (value: unknown, operation: string): Record<string, JsonValue> => {
  if (!isJsonValue(value) || value === null || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError(`Codex app-server ${operation} returned a malformed response.`);
  }
  return value;
};

const textInput = (
  value: JsonValue,
): readonly [
  { readonly type: "text"; readonly text: string; readonly text_elements: readonly [] },
] => [
  {
    type: "text",
    text: typeof value === "string" ? value : JSON.stringify(value),
    text_elements: [],
  },
];

const threadIdFromSession = (request: AgentStartRequest): string | undefined => {
  const session = request.providerSession;
  if (session && session.providerId !== "provider.codex") {
    throw new TypeError("Codex continuation requires a Codex provider-session reference.");
  }
  return session?.sessionId;
};

const terminalStatus = (value: unknown): AgentResult["status"] => {
  if (value === "completed") return "completed";
  if (value === "interrupted") return "cancelled";
  return "failed";
};

type NotificationProjection =
  | { readonly kind: "ignored" }
  | { readonly kind: "text"; readonly delta: string }
  | { readonly kind: "recipient"; readonly clientId: string; readonly evidenceRef: string }
  | { readonly kind: "terminal"; readonly status: AgentResult["status"] };

type NotificationProjector = (
  params: Record<string, JsonValue>,
  scoped: boolean,
  turnId: string,
) => NotificationProjection;

const ignored = (): NotificationProjection => ({ kind: "ignored" });

const projectAgentDelta: NotificationProjector = (params, scoped) =>
  scoped && typeof params.delta === "string" ? { kind: "text", delta: params.delta } : ignored();

const projectCompletedItem: NotificationProjector = (params, scoped) => {
  if (!scoped) return ignored();
  const item = record(params.item, "item/completed");
  return item.type === "userMessage" &&
    typeof item.clientId === "string" &&
    typeof item.id === "string"
    ? { kind: "recipient", clientId: item.clientId, evidenceRef: `codex-item:${item.id}` }
    : ignored();
};

const projectCompletedTurn: NotificationProjector = (params, scoped, turnId) => {
  if (!scoped) return ignored();
  const completed = record(params.turn, "turn/completed");
  return completed.id === turnId
    ? { kind: "terminal", status: terminalStatus(completed.status) }
    : ignored();
};

const notificationProjectors: Readonly<Record<string, NotificationProjector>> = Object.freeze({
  "item/agentMessage/delta": projectAgentDelta,
  "item/completed": projectCompletedItem,
  "turn/completed": projectCompletedTurn,
});

const projectNotification = (
  notification: CodexAppServerNotification,
  threadId: string,
  turnId: string,
): NotificationProjection => {
  const params = record(notification.params, notification.method);
  const scoped = params.threadId === threadId && params.turnId === turnId;
  return notificationProjectors[notification.method]?.(params, scoped, turnId) ?? ignored();
};

export const createCodexAppServerRunner = ({
  client,
  identity,
  output,
}: CodexAppServerRunnerOptions): NativeAgentRunner => {
  const prepared = new WeakSet<object>();

  const prepare = (definition: AgentDefinition): PreparedAgentDefinition => {
    const value = createPreparedAgentDefinition(definition);
    prepared.add(value);
    return value;
  };

  const start = async (request: AgentStartRequest): Promise<NativeAgentRun> => {
    if (!prepared.has(request.agent)) {
      throw new TypeError("Codex app-server accepts only definitions prepared by this runner.");
    }
    const continuedThreadId = threadIdFromSession(request);
    const threadResponse = record(
      await client.request(
        continuedThreadId
          ? { method: "thread/resume", params: { threadId: continuedThreadId } }
          : { method: "thread/start", params: {} },
      ),
      continuedThreadId ? "thread/resume" : "thread/start",
    );
    const thread = record(threadResponse.thread, "thread identity");
    if (typeof thread.id !== "string" || thread.id.length === 0) {
      throw new TypeError("Codex app-server did not return a thread identity.");
    }
    if (continuedThreadId && thread.id !== continuedThreadId) {
      throw new TypeError("Codex app-server continuation changed the thread identity.");
    }
    const threadId = thread.id;
    const providerSession = createProviderSessionRef({
      kind: "provider-session-ref",
      providerId: "provider.codex",
      sessionId: externalId<ProviderSessionId>(threadId),
    });
    const turnResponse = record(
      await client.request({
        method: "turn/start",
        params: { threadId, input: textInput(request.input) as unknown as JsonValue },
      }),
      "turn/start",
    );
    const turn = record(turnResponse.turn, "turn identity");
    if (typeof turn.id !== "string" || turn.id.length === 0) {
      throw new TypeError("Codex app-server did not return a turn identity.");
    }
    const turnId = turn.id;
    const runId = identity.runId();
    let terminal: AgentResult | undefined;
    let finalText = "";
    let sequence = 0;
    const evidence = new Map<string, string>();
    const submittedMessages = new Set<string>();

    const terminalEvent = (status: AgentResult["status"], reasonCode?: string): AgentEvent =>
      ({
        eventId: identity.eventId(),
        kind: `agent.run.${status}`,
        occurredAt: identity.now(),
        sequence: sequence++,
        identity: { runId },
        facts: { status, ...(reasonCode ? { reasonCode } : {}) },
      }) as AgentEvent;

    const applyProjection = async (
      projected: NotificationProjection,
    ): Promise<AgentEvent | null> => {
      if (projected.kind === "text") {
        finalText += projected.delta;
        return null;
      }
      if (projected.kind === "recipient") {
        evidence.set(projected.clientId, projected.evidenceRef);
        return null;
      }
      if (projected.kind !== "terminal") return null;
      let status = projected.status;
      let reasonCode: string | undefined;
      let projectedText: string | undefined;
      if (status === "completed") {
        projectedText = await output.projectAgentText({
          providerId: "provider.codex",
          routeProfileId: "codex.app-server.coordinator-owned",
          threadId,
          turnId,
          text: finalText,
        });
        if (typeof projectedText !== "string") {
          status = "failed";
          reasonCode = "app-server-output-redaction-rejected";
        }
      }
      terminal = {
        identity: { runId },
        status,
        ...(status === "completed" ? { output: createAgentTextOutput(projectedText!) } : {}),
        ...(reasonCode ? { reasonCode } : {}),
        providerSession,
      };
      return terminalEvent(status, reasonCode);
    };

    const events = async function* (): AsyncGenerator<AgentEvent> {
      yield {
        eventId: identity.eventId(),
        kind: "agent.run.started",
        occurredAt: identity.now(),
        sequence: sequence++,
        identity: { runId },
        facts: { agentId: request.agent.agentId, agentVersion: request.agent.version },
      };
      for await (const notification of client.notifications(threadId)) {
        const event = await applyProjection(projectNotification(notification, threadId, turnId));
        if (!event) continue;
        yield event;
        return;
      }
      if (!terminal) {
        terminal = {
          identity: { runId },
          status: "failed",
          reasonCode: "app-server-disconnected",
          providerSession,
        };
        yield terminalEvent("failed", "app-server-disconnected");
      }
    };

    const drain = events();
    const eventBuffer: AgentEvent[] = [];
    let pumpFinished = false;
    const pump = (async () => {
      try {
        for await (const event of drain) eventBuffer.push(event);
      } catch {
        terminal = {
          identity: { runId },
          status: "failed",
          reasonCode: "app-server-malformed-notification",
          providerSession,
        };
        eventBuffer.push(terminalEvent("failed", "app-server-malformed-notification"));
      } finally {
        pumpFinished = true;
      }
    })();

    return Object.freeze({
      identity: Object.freeze({ runId: coreId<RunId>(runId) }),
      events: async function* () {
        let index = 0;
        while (!pumpFinished || index < eventBuffer.length) {
          while (index < eventBuffer.length) yield eventBuffer[index++]!;
          if (!pumpFinished)
            await Promise.race([pump, new Promise((resolve) => setTimeout(resolve, 0))]);
        }
      },
      result: async () => {
        await pump;
        return terminal!;
      },
      providerSession: () => providerSession,
      submitInput: async (input: AdmittedAgentActiveInput) => {
        if (!isAdmittedAgentActiveInput(input))
          throw new TypeError("Codex steering requires admitted active input.");
        if (terminal) {
          return registerAgentActiveInputAcknowledgement(
            {
              status: "already-terminal",
              messageId: input.messageId,
              correlationId: input.correlationId,
              acknowledgedAt: identity.now(),
            },
            input,
          );
        }
        if (submittedMessages.has(input.messageId)) {
          return registerAgentActiveInputAcknowledgement(
            {
              status: "rejected",
              messageId: input.messageId,
              correlationId: input.correlationId,
              acknowledgedAt: identity.now(),
              reasonCode: "duplicate-input",
            },
            input,
          );
        }
        submittedMessages.add(input.messageId);
        try {
          const response = record(
            await client.request({
              method: "turn/steer",
              params: {
                threadId,
                expectedTurnId: turnId,
                clientUserMessageId: input.messageId,
                input: textInput(input.content) as unknown as JsonValue,
              },
            }),
            "turn/steer",
          );
          if (response.turnId !== turnId)
            throw new TypeError("Codex app-server steering changed the active turn identity.");
          return registerAgentActiveInputAcknowledgement(
            {
              status: "accepted",
              messageId: input.messageId,
              correlationId: input.correlationId,
              acknowledgedAt: identity.now(),
            },
            input,
          );
        } catch {
          submittedMessages.delete(input.messageId);
          return registerAgentActiveInputAcknowledgement(
            {
              status: "rejected",
              messageId: input.messageId,
              correlationId: input.correlationId,
              acknowledgedAt: identity.now(),
              reasonCode: "provider-rejected",
            },
            input,
          );
        }
      },
      activeInputEvidence: (inputIdentity: AgentActiveInputIdentity) =>
        registerAgentActiveInputProcessingEvidence(
          evidence.has(inputIdentity.messageId)
            ? {
                status: "recipient-observed",
                messageId: inputIdentity.messageId,
                correlationId: inputIdentity.correlationId,
                observedAt: identity.now(),
                evidenceRef: evidence.get(inputIdentity.messageId)!,
              }
            : {
                status: "unavailable",
                messageId: inputIdentity.messageId,
                correlationId: inputIdentity.correlationId,
                stage: "semantic-processing",
                declaredAt: identity.now(),
                reasonCode: "provider-unobservable",
              },
          inputIdentity,
        ),
      cancel: async (
        _request: AgentCancellationRequest,
      ): Promise<AgentCancellationAcknowledgement> => {
        if (terminal) return { status: "already-terminal", acknowledgedAt: identity.now() };
        await client.request({ method: "turn/interrupt", params: { threadId, turnId } });
        return { status: "acknowledged", acknowledgedAt: identity.now() };
      },
      intervene: async (
        _decision: InterventionDecision,
      ): Promise<AgentInterventionAcknowledgement> => ({
        status: "unsupported",
        acknowledgedAt: identity.now(),
      }),
    });
  };

  return Object.freeze({
    capabilities: () =>
      Object.freeze({
        runnerId: "codex.app-server",
        runnerVersion: codexAppServerConversationProfile.routeProfileVersion,
        controlledEffects: false,
        cancellation: "cooperative",
        interventions: false,
        checkpointResume: false,
        providerSessionContinuation: true,
        durableExecutionSignalling: false,
        childRuns: false,
        nativeConversation: codexAppServerConversationProfile,
      }),
    prepare,
    start,
  });
};
