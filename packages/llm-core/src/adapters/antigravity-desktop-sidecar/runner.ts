import {
  externalId,
  type EventId,
  type JsonValue,
  type ProviderSessionId,
  type RunId,
} from "#contracts";
import { isPortableRecord } from "#shared/portable-data";
import {
  createPreparedAgentDefinition,
  isAdmittedAgentActiveInput,
  registerAgentActiveInputAcknowledgement,
  registerAgentActiveInputProcessingEvidence,
  type AdmittedAgentActiveInput,
  type AgentActiveInputIdentity,
  type AgentDefinition,
  type AgentEvent,
  type AgentResult,
  type AgentStartRequest,
  type NativeAgentRun,
  type NativeAgentRunner,
  type PreparedAgentDefinition,
} from "../../features/agent/public";
import { createProviderSessionRef, type ProviderSessionRef } from "../../features/state/public";
import {
  ANTIGRAVITY_DESKTOP_HOST_VERSION,
  ANTIGRAVITY_SIDECAR_CONTRACT_VERSION,
  antigravityDesktopSidecarConversationProfile,
} from "./profile";
import {
  AntigravitySidecarConfigurationError,
  AntigravitySidecarProcessError,
  AntigravityStaleConversationError,
  type AntigravityDesktopSidecarClient,
} from "./protocol";

export interface AntigravityDesktopSidecarIdentity {
  runId(): RunId;
  eventId(): EventId;
  now(): string;
}

export interface AntigravityDesktopSidecarRunnerOptions {
  readonly client: AntigravityDesktopSidecarClient;
  readonly identity: AntigravityDesktopSidecarIdentity;
  readonly projectId?: string;
}

const conversationIdFromSession = (request: AgentStartRequest): string | undefined => {
  const session = request.providerSession;
  if (session && session.providerId !== "provider.antigravity") {
    throw new TypeError(
      "Antigravity Desktop Sidecar continuation requires an Antigravity provider-session reference.",
    );
  }
  return session?.sessionId;
};

const formatPromptText = (input: JsonValue): string => {
  if (typeof input === "string") return input;
  if (isPortableRecord(input) && typeof input.text === "string") return input.text;
  return JSON.stringify(input);
};

const assertQualifiedClient = (client: AntigravityDesktopSidecarClient): void => {
  const source = client.sourceContract;
  if (
    source.desktopHostVersion !== ANTIGRAVITY_DESKTOP_HOST_VERSION ||
    source.sidecarContractVersion !== ANTIGRAVITY_SIDECAR_CONTRACT_VERSION ||
    source.identities.desktopApp.product !== "Antigravity Desktop" ||
    source.identities.desktopApp.version !== ANTIGRAVITY_DESKTOP_HOST_VERSION ||
    source.identities.desktopApp.bundleId !== "com.google.antigravity" ||
    source.identities.sidecar.id !== "simple-chat-qualification" ||
    !source.identities.sidecar.supervised ||
    source.identities.sidecar.restartPolicy !== "never" ||
    source.identities.agentapi.executable !== "agentapi" ||
    !source.identities.agentapi.providerInjected ||
    source.identities.agentapi.path !== "/usr/local/bin/agentapi"
  ) {
    throw new TypeError(
      "Antigravity Desktop Sidecar client does not match the qualified source contract.",
    );
  }
};

type SidecarFailureReason =
  | "configuration-disabled"
  | "project-id-missing"
  | "process-unavailable"
  | "process-crashed"
  | "agent-api-unavailable"
  | "stale-session"
  | "provider-rejected"
  | "provider-unobservable";

const failureReason = (error: unknown): SidecarFailureReason => {
  if (error instanceof AntigravitySidecarConfigurationError) {
    return error.failure === "disabledConfiguration"
      ? "configuration-disabled"
      : "project-id-missing";
  }
  if (error instanceof AntigravitySidecarProcessError) {
    if (error.failure === "processCrash") return "process-crashed";
    if (error.failure === "unavailableAgentApi") return "agent-api-unavailable";
    return "process-unavailable";
  }
  if (error instanceof AntigravityStaleConversationError) return "stale-session";
  return "provider-rejected";
};

const dispatchConversation = async (input: {
  client: AntigravityDesktopSidecarClient;
  request: AgentStartRequest;
  continuedConversationId?: string;
  projectId?: string;
}): Promise<string> => {
  if (!input.continuedConversationId) {
    const created = await input.client.newConversation({
      prompt: formatPromptText(input.request.input),
      projectId: input.projectId,
    });
    if (!created.conversationId) throw new TypeError("Sidecar did not return a conversation ID.");
    return created.conversationId;
  }

  const state = await input.client.inspectConversation(input.continuedConversationId);
  if (state.state !== "idle") {
    throw new AntigravityStaleConversationError(
      input.continuedConversationId,
      "Sidecar continuation target is not verifiably idle.",
    );
  }
  const sent = await input.client.sendMessage({
    conversationId: input.continuedConversationId,
    prompt: formatPromptText(input.request.input),
  });
  if (!sent.accepted) throw new AntigravityStaleConversationError(input.continuedConversationId);
  return input.continuedConversationId;
};

const terminalRun = (input: {
  runId: RunId;
  session?: ProviderSessionRef;
  events: readonly AgentEvent[];
  result: AgentResult;
  identity: AntigravityDesktopSidecarIdentity;
}): NativeAgentRun =>
  Object.freeze({
    identity: Object.freeze({ runId: input.runId }),
    providerSession: () => input.session,
    events: async function* () {
      for (const event of input.events) yield event;
    },
    result: () => input.result,
    submitInput: (activeInput: AdmittedAgentActiveInput) => {
      if (!isAdmittedAgentActiveInput(activeInput)) {
        throw new TypeError("Antigravity Sidecar active input requires admitted active input.");
      }
      return registerAgentActiveInputAcknowledgement(
        {
          status: "unsupported",
          messageId: activeInput.messageId,
          correlationId: activeInput.correlationId,
          acknowledgedAt: input.identity.now(),
        },
        activeInput,
      );
    },
    activeInputEvidence: (activeIdentity: AgentActiveInputIdentity) =>
      registerAgentActiveInputProcessingEvidence(
        {
          status: "unavailable",
          messageId: activeIdentity.messageId,
          correlationId: activeIdentity.correlationId,
          stage: "recipient-observation",
          declaredAt: input.identity.now(),
          reasonCode: "provider-unobservable",
        },
        activeIdentity,
      ),
    intervene: () => ({ status: "unsupported" as const, acknowledgedAt: input.identity.now() }),
    cancel: () => ({ status: "unsupported" as const, acknowledgedAt: input.identity.now() }),
  });

export const createAntigravityDesktopSidecarRunner = ({
  client,
  identity,
  projectId,
}: AntigravityDesktopSidecarRunnerOptions): NativeAgentRunner => {
  assertQualifiedClient(client);
  const prepared = new WeakSet<object>();
  const activeConversations = new Set<string>();

  const prepare = (definition: AgentDefinition): PreparedAgentDefinition => {
    const value = createPreparedAgentDefinition(definition);
    prepared.add(value);
    return value;
  };

  const start = async (request: AgentStartRequest): Promise<NativeAgentRun> => {
    if (!prepared.has(request.agent)) {
      throw new TypeError(
        "Antigravity Sidecar runner accepts only definitions prepared by this runner.",
      );
    }

    const runId = identity.runId();
    const continuedConversationId = conversationIdFromSession(request);
    if (continuedConversationId && activeConversations.has(continuedConversationId)) {
      throw new TypeError("Antigravity Sidecar continuation requires an idle conversation.");
    }
    if (continuedConversationId) activeConversations.add(continuedConversationId);

    let session = continuedConversationId
      ? createProviderSessionRef({
          kind: "provider-session-ref",
          providerId: "provider.antigravity",
          sessionId: externalId<ProviderSessionId>(continuedConversationId),
        })
      : undefined;
    const events: AgentEvent[] = [];
    let sequence = 0;
    try {
      const conversationId = await dispatchConversation({
        client,
        request,
        continuedConversationId,
        projectId,
      });

      session = createProviderSessionRef({
        kind: "provider-session-ref",
        providerId: "provider.antigravity",
        sessionId: externalId<ProviderSessionId>(conversationId),
      });
      events.push({
        eventId: identity.eventId(),
        kind: "agent.run.started",
        occurredAt: identity.now(),
        sequence: sequence++,
        identity: { runId },
        facts: { agentId: request.agent.agentId, agentVersion: request.agent.version },
      });

      const reasonCode: SidecarFailureReason = "provider-unobservable";
      const result: AgentResult = {
        identity: { runId },
        status: "failed",
        reasonCode,
        providerSession: session,
      };
      events.push({
        eventId: identity.eventId(),
        kind: "agent.run.failed",
        occurredAt: identity.now(),
        sequence,
        identity: { runId },
        facts: { status: "failed", reasonCode },
      });
      return terminalRun({ runId, session, events, result, identity });
    } catch (error) {
      const reasonCode = failureReason(error);
      const result: AgentResult = {
        identity: { runId },
        status: "failed",
        reasonCode,
        ...(session ? { providerSession: session } : {}),
      };
      events.push({
        eventId: identity.eventId(),
        kind: "agent.run.failed",
        occurredAt: identity.now(),
        sequence,
        identity: { runId },
        facts: { status: "failed", reasonCode },
      });
      return terminalRun({ runId, session, events, result, identity });
    } finally {
      if (continuedConversationId) activeConversations.delete(continuedConversationId);
    }
  };

  return Object.freeze({
    capabilities: () =>
      Object.freeze({
        runnerId: "antigravity.desktop-sidecar",
        runnerVersion: antigravityDesktopSidecarConversationProfile.routeProfileVersion,
        controlledEffects: false,
        cancellation: "none",
        interventions: false,
        checkpointResume: false,
        providerSessionContinuation: true,
        durableExecutionSignalling: false,
        childRuns: false,
        nativeConversation: antigravityDesktopSidecarConversationProfile,
      }),
    prepare,
    start,
  });
};
