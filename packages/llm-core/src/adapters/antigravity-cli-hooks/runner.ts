import {
  coreId,
  externalId,
  isExternalId,
  isJsonValue,
  type EventId,
  type JsonValue,
  type ProviderSessionId,
  type RunId,
} from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import { isPortableRecord } from "#shared/portable-data";
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
import { ANTIGRAVITY_CLI_VERSION, antigravityCliHooksConversationProfile } from "./profile";
import {
  AntigravityConcurrentRunError,
  type AntigravityCliClient,
  type AntigravityCliResultStatus,
  type AntigravityProcessHandle,
} from "./protocol";

export interface AntigravityCliHooksIdentity {
  runId(): RunId;
  eventId(): EventId;
  now(): string;
}

export interface AntigravityCliHooksOutputProjector {
  projectAgentText(input: {
    readonly providerId: "provider.antigravity";
    readonly routeProfileId: "antigravity.cli-hooks.execution-boundary";
    readonly conversationId: string;
    readonly text: string;
  }): MaybePromise<string | undefined>;
}

export interface AntigravityCliHooksRunnerOptions {
  readonly client: AntigravityCliClient;
  readonly identity: AntigravityCliHooksIdentity;
  readonly output: AntigravityCliHooksOutputProjector;
}

const conversationIdFromSession = (request: AgentStartRequest): string | undefined => {
  const session = request.providerSession;
  if (session && session.providerId !== "provider.antigravity") {
    throw new TypeError(
      "Antigravity continuation requires an Antigravity provider-session reference.",
    );
  }
  return session?.sessionId;
};

const formatPromptText = (input: JsonValue): string => {
  if (typeof input === "string") return input;
  if (isPortableRecord(input) && typeof input.text === "string") return input.text;
  return JSON.stringify(input);
};

type StreamProjection =
  | { readonly kind: "init"; readonly conversationId: string }
  | {
      readonly kind: "step-update";
      readonly conversationId: string;
      readonly textDelta?: string;
    }
  | {
      readonly kind: "result";
      readonly conversationId: string;
      readonly status: AgentResult["status"];
      readonly response: string;
      readonly reasonCode?: string;
    };

const resultStatus = (
  status: AntigravityCliResultStatus,
): Pick<Extract<StreamProjection, { kind: "result" }>, "status" | "reasonCode"> => {
  if (status === "SUCCESS") return { status: "completed" };
  if (status === "CANCELED" || status === "INTERRUPTED") return { status: "cancelled" };
  return { status: "failed", reasonCode: `cli-result-${status.toLowerCase()}` };
};

const requireConversationId = (value: unknown): string => {
  if (!isExternalId(value)) {
    throw new TypeError("Antigravity stream event requires a portable conversation identity.");
  }
  return value;
};

const RESULT_STATUSES = new Set<AntigravityCliResultStatus>([
  "SUCCESS",
  "ERROR",
  "CANCELED",
  "INTERRUPTED",
  "INVALID",
  "WAITING",
  "RUNNING",
]);

const projectInitEvent = (value: Readonly<Record<string, JsonValue>>): StreamProjection => {
  if (!isPortableRecord(value.init)) {
    throw new TypeError("Antigravity init event requires its native payload.");
  }
  return { kind: "init", conversationId: requireConversationId(value.conversation_id) };
};

const projectStepUpdateEvent = (value: Readonly<Record<string, JsonValue>>): StreamProjection => {
  const step = value.step_update;
  if (
    !isPortableRecord(step) ||
    !Number.isInteger(step.step_index) ||
    (step.state !== "ACTIVE" && step.state !== "DONE") ||
    typeof step.step_type !== "string" ||
    (step.text_delta !== undefined && typeof step.text_delta !== "string")
  ) {
    throw new TypeError("Antigravity step_update event requires its exact native payload.");
  }
  return {
    kind: "step-update",
    conversationId: requireConversationId(step.conversation_id),
    ...(typeof step.text_delta === "string" ? { textDelta: step.text_delta } : {}),
  };
};

const projectResultEvent = (value: Readonly<Record<string, JsonValue>>): StreamProjection => {
  const result = value.result;
  if (
    !isPortableRecord(result) ||
    !RESULT_STATUSES.has(result.status as AntigravityCliResultStatus) ||
    typeof result.response !== "string" ||
    (result.error !== undefined && typeof result.error !== "string")
  ) {
    throw new TypeError("Antigravity result event requires its exact native payload.");
  }
  return {
    kind: "result",
    conversationId: requireConversationId(result.conversation_id),
    response: result.response,
    ...resultStatus(result.status as AntigravityCliResultStatus),
  };
};

const projectStreamEvent = (value: unknown): StreamProjection => {
  if (!isPortableRecord(value) || !isJsonValue(value) || typeof value.event !== "string") {
    throw new TypeError("Malformed stream-json event emitted by Antigravity CLI.");
  }
  if (value.event === "init") return projectInitEvent(value);
  if (value.event === "step_update") return projectStepUpdateEvent(value);
  if (value.event === "result") return projectResultEvent(value);
  throw new TypeError("Antigravity CLI emitted an event outside the pinned stream contract.");
};

const reserveContinuedConversation = (
  activeConversations: Set<string>,
  conversationId: string | undefined,
): string | undefined => {
  if (!conversationId) return conversationId;
  if (activeConversations.has(conversationId)) {
    throw new AntigravityConcurrentRunError(conversationId);
  }
  activeConversations.add(conversationId);
  return conversationId;
};

const spawnWithReservation = async (input: {
  readonly client: AntigravityCliClient;
  readonly command: Parameters<AntigravityCliClient["spawn"]>[0];
  readonly activeConversations: Set<string>;
  readonly reservedConversationId: string | undefined;
}): Promise<AntigravityProcessHandle> => {
  try {
    return await input.client.spawn(input.command);
  } catch (error) {
    if (input.reservedConversationId) {
      input.activeConversations.delete(input.reservedConversationId);
    }
    throw error;
  }
};

export const createAntigravityCliHooksRunner = ({
  client,
  identity,
  output,
}: AntigravityCliHooksRunnerOptions): NativeAgentRunner => {
  if (
    client.sourceContract.executable !== "agy" ||
    client.sourceContract.version !== ANTIGRAVITY_CLI_VERSION
  ) {
    throw new TypeError("Antigravity CLI client does not match the qualified source contract.");
  }
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
        "Antigravity CLI runner accepts only definitions prepared by this runner.",
      );
    }
    const continuedConversationId = conversationIdFromSession(request);
    let reservedConversationId = reserveContinuedConversation(
      activeConversations,
      continuedConversationId,
    );
    const handle = await spawnWithReservation({
      client,
      command: {
        prompt: formatPromptText(request.input),
        ...(continuedConversationId ? { conversationId: continuedConversationId } : {}),
        outputFormat: "stream-json",
      },
      activeConversations,
      reservedConversationId,
    });
    const runId = identity.runId();
    let conversationId = continuedConversationId;
    let providerSession: ProviderSessionRef | undefined;
    let resolveProviderSession!: (value: ProviderSessionRef | undefined) => void;
    let providerSessionSettled = false;
    const providerSessionPromise = new Promise<ProviderSessionRef | undefined>((resolve) => {
      resolveProviderSession = resolve;
    });
    let terminal: AgentResult | undefined;
    let sequence = 0;

    const settleProviderSession = (value: ProviderSessionRef | undefined): void => {
      if (providerSessionSettled) return;
      providerSessionSettled = true;
      resolveProviderSession(value);
    };

    const establishConversation = (candidate: string): void => {
      requireConversationId(candidate);
      if (conversationId && conversationId !== candidate) {
        throw new TypeError("Antigravity conversation identity changed during one run.");
      }
      if (!reservedConversationId) {
        if (activeConversations.has(candidate)) throw new AntigravityConcurrentRunError(candidate);
        activeConversations.add(candidate);
        reservedConversationId = candidate;
      }
      conversationId = candidate;
      if (!providerSession) {
        providerSession = createProviderSessionRef({
          kind: "provider-session-ref",
          providerId: "provider.antigravity",
          sessionId: externalId<ProviderSessionId>(candidate),
        });
        settleProviderSession(providerSession);
      }
    };

    if (continuedConversationId) establishConversation(continuedConversationId);

    if (handle.conversationId) {
      try {
        establishConversation(handle.conversationId);
      } catch (error) {
        await handle.cancel();
        if (reservedConversationId) activeConversations.delete(reservedConversationId);
        throw error;
      }
    }

    const terminalEvent = (status: AgentResult["status"], reasonCode?: string): AgentEvent =>
      ({
        eventId: identity.eventId(),
        kind: `agent.run.${status}`,
        occurredAt: identity.now(),
        sequence: sequence++,
        identity: { runId },
        facts: { status, ...(reasonCode ? { reasonCode } : {}) },
      }) as AgentEvent;

    const projectTerminalResult = async (
      projected: Extract<StreamProjection, { kind: "result" }>,
    ): Promise<AgentResult> => {
      if (projected.status !== "completed") {
        return {
          identity: { runId },
          status: projected.status,
          ...(projected.reasonCode ? { reasonCode: projected.reasonCode } : {}),
          ...(providerSession ? { providerSession } : {}),
        };
      }
      const projectedText = await output.projectAgentText({
        providerId: "provider.antigravity",
        routeProfileId: "antigravity.cli-hooks.execution-boundary",
        conversationId: projected.conversationId,
        text: projected.response,
      });
      if (typeof projectedText !== "string") {
        return {
          identity: { runId },
          status: "failed",
          reasonCode: "cli-output-redaction-rejected",
          ...(providerSession ? { providerSession } : {}),
        };
      }
      return {
        identity: { runId },
        status: "completed",
        output: createAgentTextOutput(projectedText),
        ...(providerSession ? { providerSession } : {}),
      };
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

      for await (const rawEvent of handle.events) {
        const projected = projectStreamEvent(rawEvent);
        establishConversation(projected.conversationId);
        if (projected.kind !== "result") continue;

        terminal = await projectTerminalResult(projected);
        yield terminalEvent(terminal.status, terminal.reasonCode);
        return;
      }

      terminal = {
        identity: { runId },
        status: "failed",
        reasonCode: "process-loss",
        ...(providerSession ? { providerSession } : {}),
      };
      yield terminalEvent("failed", "process-loss");
    };

    const eventBuffer: AgentEvent[] = [];
    let pumpFinished = false;
    const pump = (async () => {
      try {
        for await (const event of events()) eventBuffer.push(event);
      } catch {
        terminal = {
          identity: { runId },
          status: "failed",
          reasonCode: "cli-malformed-notification",
          ...(providerSession ? { providerSession } : {}),
        };
        eventBuffer.push(terminalEvent("failed", "cli-malformed-notification"));
      } finally {
        pumpFinished = true;
        settleProviderSession(providerSession);
        if (reservedConversationId) activeConversations.delete(reservedConversationId);
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
      providerSession: () => providerSessionPromise,
      submitInput: async (input: AdmittedAgentActiveInput) => {
        if (!isAdmittedAgentActiveInput(input)) {
          throw new TypeError("Antigravity active input requires admitted active input.");
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
      activeInputEvidence: (inputIdentity: AgentActiveInputIdentity) => {
        return registerAgentActiveInputProcessingEvidence(
          {
            status: "unavailable",
            messageId: inputIdentity.messageId,
            correlationId: inputIdentity.correlationId,
            stage: "recipient-observation",
            declaredAt: identity.now(),
            reasonCode: "provider-unobservable",
          },
          inputIdentity,
        );
      },
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
        runnerId: "antigravity.cli-hooks",
        runnerVersion: antigravityCliHooksConversationProfile.routeProfileVersion,
        controlledEffects: false,
        cancellation: "none",
        interventions: false,
        checkpointResume: false,
        providerSessionContinuation: true,
        durableExecutionSignalling: false,
        childRuns: false,
        nativeConversation: antigravityCliHooksConversationProfile,
      }),
    prepare,
    start,
  });
};
