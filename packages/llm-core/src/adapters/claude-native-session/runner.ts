import { claudeStreamContract, terminalFailureReason } from "./stream-contract";
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
  type AgentActiveInputIdentity,
  type AgentCancellationAcknowledgement,
  type AgentCancellationRequest,
  type AgentDefinition,
  type AgentEvent,
  type AgentInterventionAcknowledgement,
  type AgentResult,
  type AgentStartRequest,
  type NativeAgentRun,
  type NativeAgentRunner,
  type PreparedAgentDefinition,
} from "../../features/agent/public";
import {
  createProviderSessionRef,
  type InterventionDecision,
  type ProviderSessionRef,
} from "../../features/state/public";
import type { MaybePromise } from "#shared/maybe";
import { isPortableRecord } from "#shared/portable-data";
import { claudeCrossSessionConversationProfile } from "./profile";
import { type ClaudeNativeSessionClient, type ClaudeStreamEvent } from "./protocol";

export interface ClaudeNativeSessionIdentity {
  runId(): RunId;
  eventId(): EventId;
  now(): string;
}

export interface ClaudeNativeSessionOutputProjector {
  projectAgentText(input: {
    readonly providerId: typeof claudeStreamContract.providerId;
    readonly routeProfileId: typeof claudeStreamContract.routeProfileId;
    readonly sessionId: string;
    readonly text: string;
  }): MaybePromise<string | undefined>;
}

export interface ClaudeNativeSessionEventObserver {
  observe(input: {
    readonly sessionId: string;
    readonly event: ClaudeStreamEvent;
  }): MaybePromise<void>;
}

export interface ClaudeNativeSessionRunnerOptions {
  readonly client: ClaudeNativeSessionClient;
  readonly identity: ClaudeNativeSessionIdentity;
  readonly output: ClaudeNativeSessionOutputProjector;
  readonly nativeEvents: ClaudeNativeSessionEventObserver;
}

const sessionIdFromStartRequest = (request: AgentStartRequest): string | undefined => {
  const session = request.providerSession;
  if (session && session.providerId !== claudeStreamContract.providerId) {
    throw new TypeError(claudeStreamContract.messages.invalidContinuationProvider);
  }
  return session?.sessionId;
};

type ClaudeStreamProjection =
  | { readonly kind: "ignored" }
  | { readonly kind: "session"; readonly sessionId: string }
  | { readonly kind: "text"; readonly delta: string }
  | {
      readonly kind: "terminal";
      readonly status: AgentResult["status"];
      readonly sessionId?: string;
      readonly reasonCode?: string;
      readonly resultText?: string;
    };

const extractTextFromContent = (content: unknown): string => {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (item): item is Record<string, JsonValue> =>
        isPortableRecord(item) && item.type === claudeStreamContract.events.assistant.textPartType,
    )
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("");
};

const projectSessionInitialisation = (event: ClaudeStreamEvent): ClaudeStreamProjection => {
  const sessionId = event.session_id;
  return event.subtype === claudeStreamContract.events.initialisation.subtype &&
    typeof sessionId === "string" &&
    sessionId.length > 0
    ? { kind: "session", sessionId }
    : { kind: "ignored" };
};

const projectAssistantText = (event: ClaudeStreamEvent): ClaudeStreamProjection => {
  if (!isPortableRecord(event.message)) return { kind: "ignored" };
  const text = extractTextFromContent(event.message.content);
  return text.length > 0 ? { kind: "text", delta: text } : { kind: "ignored" };
};

const projectTerminalResult = (event: ClaudeStreamEvent): ClaudeStreamProjection => {
  const sessionId = typeof event.session_id === "string" ? event.session_id : undefined;
  const hasNativeError =
    event.is_error !== false ||
    event.error !== undefined ||
    event.terminal_reason !== claudeStreamContract.events.terminal.completedReason;
  if (event.subtype === claudeStreamContract.events.terminal.successfulSubtype && !hasNativeError) {
    const resultText = typeof event.result === "string" ? event.result : undefined;
    return { kind: "terminal", status: "completed", sessionId, resultText };
  }
  return {
    kind: "terminal",
    status: "failed",
    sessionId,
    reasonCode: terminalFailureReason(event),
  };
};

const projectClaudeStreamEvent = (event: ClaudeStreamEvent): ClaudeStreamProjection => {
  switch (event.type) {
    case claudeStreamContract.events.initialisation.type:
      return projectSessionInitialisation(event);
    case claudeStreamContract.events.assistant.type:
      return projectAssistantText(event);
    case claudeStreamContract.events.terminal.type:
      return projectTerminalResult(event);
    default:
      return { kind: "ignored" };
  }
};

const formatPromptText = (input: JsonValue): string => {
  if (typeof input === "string") return input;
  if (isPortableRecord(input) && typeof input.text === "string") return input.text;
  return JSON.stringify(input);
};

export const createClaudeNativeSessionRunner = ({
  client,
  identity,
  output,
  nativeEvents,
}: ClaudeNativeSessionRunnerOptions): NativeAgentRunner => {
  const prepared = new WeakSet<object>();
  const activeSessions = new Set<string>();

  const prepare = (definition: AgentDefinition): PreparedAgentDefinition => {
    const value = createPreparedAgentDefinition(definition);
    prepared.add(value);
    return value;
  };

  const start = async (request: AgentStartRequest): Promise<NativeAgentRun> => {
    if (!prepared.has(request.agent)) {
      throw new TypeError(claudeStreamContract.messages.foreignPreparedDefinition);
    }

    const continuedSessionId = sessionIdFromStartRequest(request);
    if (continuedSessionId && activeSessions.has(continuedSessionId)) {
      throw new TypeError(claudeStreamContract.messages.sessionAlreadyActive);
    }
    const prompt = formatPromptText(request.input);
    const handle = await client.spawn({
      prompt,
      ...(continuedSessionId ? { sessionId: continuedSessionId } : {}),
      options: {
        print: true,
        outputFormat: claudeStreamContract.outputFormat,
        verbose: true,
        includeHookEvents: true,
      },
    });

    if (handle.sessionId.length === 0) {
      throw new TypeError(claudeStreamContract.messages.sessionIdentityMissing);
    }
    if (continuedSessionId && handle.sessionId !== continuedSessionId) {
      throw new TypeError(claudeStreamContract.messages.continuationIdentityChanged);
    }
    const sessionId = handle.sessionId;
    activeSessions.add(sessionId);
    const providerSession: ProviderSessionRef = createProviderSessionRef({
      kind: "provider-session-ref",
      providerId: claudeStreamContract.providerId,
      sessionId: externalId<ProviderSessionId>(sessionId),
    });

    const runId = identity.runId();
    let terminal: AgentResult | undefined;
    let finalText = "";
    let sequence = 0;
    let sessionInitialised = false;

    const terminalEvent = (status: AgentResult["status"], reasonCode?: string): AgentEvent =>
      ({
        eventId: identity.eventId(),
        kind: claudeStreamContract.portableEvents[status],
        occurredAt: identity.now(),
        sequence: sequence++,
        identity: { runId },
        facts: { status, ...(reasonCode ? { reasonCode } : {}) },
      }) as AgentEvent;

    const applyTerminalProjection = async (
      projected: Extract<ClaudeStreamProjection, { kind: "terminal" }>,
    ): Promise<AgentEvent | null> => {
      if (projected.sessionId !== sessionId) {
        terminal = {
          identity: { runId },
          status: "failed",
          reasonCode: claudeStreamContract.failures.terminalIdentityMismatch.code,
          providerSession,
        };
        return terminalEvent("failed", claudeStreamContract.failures.terminalIdentityMismatch.code);
      }

      let status = projected.status;
      let reasonCode = projected.reasonCode;
      let projectedText: string | undefined;

      if (status === "completed") {
        // Prefer the authoritative result text from the terminal event if present.
        const candidateText = projected.resultText ?? finalText;
        projectedText = await output.projectAgentText({
          providerId: claudeStreamContract.providerId,
          routeProfileId: claudeStreamContract.routeProfileId,
          sessionId,
          text: candidateText,
        });
        if (typeof projectedText !== "string") {
          status = "failed";
          reasonCode = claudeStreamContract.failures.outputRedactionRejected.code;
        }
      }

      terminal = {
        identity: { runId },
        status,
        ...(status === "completed" && projectedText !== undefined
          ? { output: createAgentTextOutput(projectedText) }
          : {}),
        ...(reasonCode ? { reasonCode } : {}),
        providerSession,
      };
      return terminalEvent(status, reasonCode);
    };

    const applyProjection = async (
      projected: ClaudeStreamProjection,
    ): Promise<AgentEvent | null> => {
      if (projected.kind === "session") {
        if (projected.sessionId !== sessionId) {
          terminal = {
            identity: { runId },
            status: "failed",
            reasonCode: claudeStreamContract.failures.initialIdentityMismatch.code,
            providerSession,
          };
          return terminalEvent(
            "failed",
            claudeStreamContract.failures.initialIdentityMismatch.code,
          );
        }
        sessionInitialised = true;
        return null;
      }
      if (projected.kind !== "ignored" && !sessionInitialised) {
        terminal = {
          identity: { runId },
          status: "failed",
          reasonCode: claudeStreamContract.failures.initialisationMissing.code,
          providerSession,
        };
        return terminalEvent("failed", claudeStreamContract.failures.initialisationMissing.code);
      }
      if (projected.kind === "text") {
        finalText += projected.delta;
        return null;
      }
      if (projected.kind !== "terminal") return null;

      return applyTerminalProjection(projected);
    };

    const events = async function* (): AsyncGenerator<AgentEvent> {
      yield {
        eventId: identity.eventId(),
        kind: claudeStreamContract.portableEvents.started,
        occurredAt: identity.now(),
        sequence: sequence++,
        identity: { runId },
        facts: { agentId: request.agent.agentId, agentVersion: request.agent.version },
      };

      for await (const rawEvent of handle.events) {
        if (!isJsonValue(rawEvent) || !isPortableRecord(rawEvent)) {
          throw new TypeError(claudeStreamContract.messages.malformedNativeEvent);
        }
        await nativeEvents.observe({ sessionId, event: rawEvent });
        const event = await applyProjection(projectClaudeStreamEvent(rawEvent));
        if (!event) continue;
        yield event;
        return;
      }

      if (!terminal) {
        terminal = {
          identity: { runId },
          status: "failed",
          reasonCode: claudeStreamContract.failures.processLoss.code,
          providerSession,
        };
        yield terminalEvent("failed", claudeStreamContract.failures.processLoss.code);
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
          reasonCode: claudeStreamContract.failures.malformedOutput.code,
          providerSession,
        };
        eventBuffer.push(
          terminalEvent("failed", claudeStreamContract.failures.malformedOutput.code),
        );
      } finally {
        pumpFinished = true;
        activeSessions.delete(sessionId);
      }
    })();

    return Object.freeze({
      identity: Object.freeze({ runId: coreId<RunId>(runId) }),
      events: async function* () {
        let index = 0;
        while (!pumpFinished || index < eventBuffer.length) {
          while (index < eventBuffer.length) yield eventBuffer[index++]!;
          if (!pumpFinished) {
            await Promise.race([pump, new Promise((resolve) => setTimeout(resolve, 0))]);
          }
        }
      },
      result: async () => {
        await pump;
        return terminal!;
      },
      providerSession: () => providerSession,
      submitInput: async (input: AdmittedAgentActiveInput) => {
        if (!isAdmittedAgentActiveInput(input)) {
          throw new TypeError(claudeStreamContract.messages.unadmittedActiveInput);
        }
        return registerAgentActiveInputAcknowledgement(
          {
            status: "unsupported",
            messageId: input.messageId,
            correlationId: input.correlationId,
            acknowledgedAt: identity.now(),
          },
          input,
        );
      },
      // Cross-session socket delivery does not expose observable evidence that the model
      // received or processed the message. The socket confirms acceptance, not observation.
      activeInputEvidence: (inputIdentity: AgentActiveInputIdentity) =>
        registerAgentActiveInputProcessingEvidence(
          {
            status: "unavailable",
            messageId: inputIdentity.messageId,
            correlationId: inputIdentity.correlationId,
            stage: "recipient-observation",
            declaredAt: identity.now(),
            reasonCode: claudeStreamContract.failures.recipientUnobservable.code,
          },
          inputIdentity,
        ),
      cancel: async (
        _request: AgentCancellationRequest,
      ): Promise<AgentCancellationAcknowledgement> => {
        return { status: "unsupported", acknowledgedAt: identity.now() };
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
        runnerId: claudeStreamContract.runnerId,
        runnerVersion: claudeCrossSessionConversationProfile.routeProfileVersion,
        controlledEffects: false,
        cancellation: "none",
        interventions: false,
        checkpointResume: false,
        providerSessionContinuation: true,
        durableExecutionSignalling: false,
        childRuns: false,
        nativeConversation: claudeCrossSessionConversationProfile,
      }),
    prepare,
    start,
  });
};
