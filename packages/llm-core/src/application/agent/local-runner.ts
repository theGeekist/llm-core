import { isCanonicalUuid, isUuidV7, type EventId, type RunId } from "#contracts";
import { isPromiseLike, maybeChain, type MaybePromise } from "#shared/maybe";
import {
  type AgentCancellationAcknowledgement,
  type AgentCancellationRequest,
  type AgentInterventionAcknowledgement,
  type AgentProgressFacts,
  type AgentResumeRequest,
  type AgentRun,
  type AgentEvent,
  type AgentEventKind,
  type AgentRunIdentity,
  type AgentRunner,
  type AgentRunnerProfile,
  type AgentStartRequest,
  type AgentDefinition,
  type PreparedAgentDefinition,
  type AgentResult,
  createPreparedAgentDefinition,
} from "../../features/agent/public";
import {
  authenticateIntervention,
  checkResumeCompatibility,
  createInterventionRequest,
  type InterventionDecision,
  type InterventionRequest,
} from "../../features/state/public";
import { isRegisteredResumableCheckpoint } from "../../features/state/runtime";
import type { RegisteredResumableCheckpoint } from "../../features/state/runtime";
import type {
  CreateLocalAgentRunnerOptions,
  LocalAgentExecutionContext,
  LocalAgentExecutionResult,
} from "./types";
import { resolvableInterventionAt } from "./intervention";
import { readInterventionAuthentication } from "./intervention-authentication";
import { guardResumeToolExecution } from "./resume-effects";
import { resultFacts } from "./run-event";
import {
  isCanonicalTimestamp,
  validateAgentStartRequest,
  validateAgentCancellationRequest,
  validateAgentEventFacts,
  validateLocalAgentExecutionResult,
} from "./validation";

const clonePortable = <T>(value: T): T => structuredClone(value);

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

const frozenPortable = <T>(value: T): T => deepFreeze(clonePortable(value));

class AgentRunEventLog {
  readonly #events: AgentEvent[] = [];
  readonly #waiters = new Set<() => void>();
  #closed = false;

  append(event: AgentEvent): void {
    if (this.#closed) {
      return;
    }
    this.#events.push(event);
    for (const wake of this.#waiters) {
      wake();
    }
    this.#waiters.clear();
  }

  close(): void {
    this.#closed = true;
    for (const wake of this.#waiters) {
      wake();
    }
    this.#waiters.clear();
  }

  stream(): AsyncIterable<AgentEvent> {
    const events = this.#events;
    const waiters = this.#waiters;
    const closed = () => this.#closed;
    return {
      async *[Symbol.asyncIterator]() {
        let index = 0;
        while (true) {
          while (index < events.length) {
            const event = events[index];
            index += 1;
            if (event) {
              yield event;
            }
          }
          if (closed()) {
            return;
          }
          await new Promise<void>((resolve) => waiters.add(resolve));
        }
      },
    };
  }
}

interface RunState {
  readonly identity: AgentRunIdentity;
  readonly log: AgentRunEventLog;
  readonly interventions: InterventionDecision[];
  readonly interventionRequests: Map<string, InterventionRequest>;
  readonly terminalEventId: EventId;
  sequence: number;
  cancellationRequested: boolean;
  lastOccurredAt: string;
  terminal?: AgentResult;
  result: MaybePromise<AgentResult>;
}

interface CreateRunInput {
  readonly request: AgentStartRequest;
  readonly identity: AgentRunIdentity;
  readonly checkpoint?: RegisteredResumableCheckpoint;
  readonly deniedReason?: string;
}

interface BuildEventInput {
  readonly state: RunState;
  readonly kind: AgentEventKind;
  readonly facts: AgentEvent["facts"];
  readonly eventId?: EventId;
  readonly occurredAt?: string;
  readonly sequence?: number;
}

const terminalKind = (status: AgentResult["status"]): AgentEventKind =>
  `agent.run.${status}` as AgentEventKind;

export const createLocalAgentRunner = (options: CreateLocalAgentRunnerOptions): AgentRunner => {
  const interventionAuthentication = readInterventionAuthentication(options);
  const runnerPreparedDefinitions = new WeakSet<object>();
  const capabilities = deepFreeze<AgentRunnerProfile>({
    runnerId: options.runnerId,
    runnerVersion: options.runnerVersion,
    controlledEffects: Boolean(options.controlledToolExecution),
    cancellation: "cooperative",
    interventions: options.interventions !== undefined,
    checkpointResume: Boolean(options.resumeCompatibility && options.program.resume),
    providerSessionContinuation: true,
    durableExecutionSignalling: false,
    childRuns: true,
  });

  const buildEvent = (input: BuildEventInput): AgentEvent => {
    const { state, kind, facts } = input;
    validateAgentEventFacts(kind, facts);
    return frozenPortable({
      eventId: input.eventId ?? readEventId(),
      kind,
      occurredAt: input.occurredAt ?? readNow(),
      sequence: input.sequence ?? state.sequence,
      identity: state.identity,
      facts,
    }) as AgentEvent;
  };

  const emit = (state: RunState, kind: AgentEventKind, facts: AgentEvent["facts"]): void => {
    const event = buildEvent({ state, kind, facts });
    state.log.append(event);
    state.lastOccurredAt = event.occurredAt;
    state.sequence += 1;
  };

  const appendBuiltEvent = (state: RunState, event: AgentEvent): void => {
    state.log.append(event);
    state.lastOccurredAt = event.occurredAt;
    state.sequence += 1;
  };

  const readNow = (): string => {
    const value = options.identity.now();
    if (!isCanonicalTimestamp(value)) {
      throw new TypeError("Agent runner clocks must return canonical timestamps.");
    }
    return value;
  };

  const readRunId = (): RunId => {
    const value = options.identity.newRunId();
    if (!isUuidV7(value)) {
      throw new TypeError("Agent runner identity ports must mint UUIDv7 run IDs.");
    }
    return value;
  };

  const readEventId = () => {
    const value = options.identity.newEventId();
    if (!isUuidV7(value)) {
      throw new TypeError("Agent runner identity ports must mint UUIDv7 event IDs.");
    }
    return value;
  };

  const settle = (state: RunState, draft: LocalAgentExecutionResult): AgentResult => {
    if (state.terminal) {
      return state.terminal;
    }
    validateLocalAgentExecutionResult(draft);
    const result = frozenPortable<AgentResult>({
      identity: state.identity,
      status: draft.status,
      ...(draft.output !== undefined ? { output: draft.output } : {}),
      ...(draft.reasonCode ? { reasonCode: draft.reasonCode } : {}),
      ...(draft.providerSession ? { providerSession: draft.providerSession } : {}),
      ...(draft.checkpoint ? { checkpoint: draft.checkpoint } : {}),
      ...(draft.durableExecution ? { durableExecution: draft.durableExecution } : {}),
    });
    let occurredAt = state.lastOccurredAt;
    try {
      occurredAt = readNow();
    } catch {
      // A broken clock cannot leave a run open after execution has settled.
    }
    const terminalEvent = buildEvent({
      state,
      kind: terminalKind(result.status),
      facts: resultFacts(result),
      eventId: state.terminalEventId,
      occurredAt,
    });
    state.terminal = result;
    state.log.append(terminalEvent);
    state.lastOccurredAt = terminalEvent.occurredAt;
    state.sequence += 1;
    state.log.close();
    return result;
  };

  const failed = (state: RunState): AgentResult =>
    settle(state, { status: "failed", reasonCode: "local-execution-threw" });

  // eslint-disable-next-line sonarjs/no-invariant-returns
  const createRun = (input: CreateRunInput): AgentRun => {
    const { request, identity, checkpoint, deniedReason } = input;
    if (
      !isCanonicalUuid(identity.runId) ||
      (identity.parentRunId !== undefined && !isCanonicalUuid(identity.parentRunId)) ||
      (identity.causalRunId !== undefined && !isCanonicalUuid(identity.causalRunId))
    ) {
      throw new TypeError("Agent run identities must be canonical UUIDs.");
    }
    const initialTimestamp = readNow();
    const state: RunState = {
      identity: frozenPortable(identity),
      log: new AgentRunEventLog(),
      interventions: [],
      interventionRequests: new Map(),
      terminalEventId: readEventId(),
      sequence: 0,
      cancellationRequested: false,
      lastOccurredAt: initialTimestamp,
      result: undefined as unknown as MaybePromise<AgentResult>,
    };

    const events = () => state.log.stream();
    const result = () => state.result;
    const cancel = (cancellation: AgentCancellationRequest): AgentCancellationAcknowledgement => {
      validateAgentCancellationRequest(cancellation);
      const acknowledgedAt = readNow();
      if (state.terminal) {
        return { status: "already-terminal", acknowledgedAt };
      }
      const requestedEvent = buildEvent({
        state,
        kind: "agent.run.cancellation.requested",
        facts: {
          requestedAt: cancellation.requestedAt,
          reasonProvided: cancellation.reason !== undefined,
        },
      });
      const acknowledgedEvent = buildEvent({
        state,
        kind: "agent.run.cancellation.acknowledged",
        facts: { acknowledgedAt },
        sequence: state.sequence + 1,
      });
      state.cancellationRequested = true;
      appendBuiltEvent(state, requestedEvent);
      appendBuiltEvent(state, acknowledgedEvent);
      return { status: "acknowledged", acknowledgedAt };
    };
    const intervene = (
      decision: InterventionDecision,
    ): MaybePromise<AgentInterventionAcknowledgement> => {
      const acknowledgedAt = readNow();
      if (state.terminal) {
        return { status: "already-terminal", acknowledgedAt };
      }
      if (!capabilities.interventions) {
        return { status: "unsupported", acknowledgedAt };
      }
      if (decision.intervention.runId !== state.identity.runId) {
        return { status: "rejected", acknowledgedAt };
      }
      const pending = state.interventionRequests.get(decision.intervention.interventionId);
      if (!pending) {
        return { status: "rejected", acknowledgedAt };
      }
      let admittedDecision: InterventionDecision;
      try {
        admittedDecision = frozenPortable(decision);
      } catch {
        return { status: "rejected", acknowledgedAt };
      }
      if (resolvableInterventionAt(pending, admittedDecision, () => acknowledgedAt) === null) {
        return { status: "rejected", acknowledgedAt };
      }
      const finish = (authenticated: boolean): AgentInterventionAcknowledgement => {
        if (!authenticated) {
          return { status: "rejected", acknowledgedAt };
        }
        if (state.terminal) {
          return { status: "already-terminal", acknowledgedAt };
        }
        if (
          state.interventionRequests.get(admittedDecision.intervention.interventionId) !== pending
        ) {
          return { status: "rejected", acknowledgedAt };
        }
        const acceptedAt = resolvableInterventionAt(pending, admittedDecision, readNow);
        if (acceptedAt === null) {
          return { status: "rejected", acknowledgedAt };
        }
        const receivedEvent = buildEvent({
          state,
          kind: "agent.run.intervention.received",
          facts: {
            decision: admittedDecision.decision,
            interventionId: admittedDecision.intervention.interventionId,
          },
        });
        state.interventions.push(admittedDecision);
        state.interventionRequests.delete(admittedDecision.intervention.interventionId);
        appendBuiltEvent(state, receivedEvent);
        return { status: "accepted", acknowledgedAt: acceptedAt };
      };
      return maybeChain(
        finish,
        authenticateIntervention({
          authentication: interventionAuthentication!,
          request: pending,
          decision: admittedDecision,
        }),
      );
    };
    const run: AgentRun = Object.freeze({
      identity: state.identity,
      events,
      result,
      cancel,
      intervene,
    });

    const startChild = (child: AgentStartRequest): AgentRun => {
      validateForRunner(child);
      return startWithIdentity(child, {
        runId: readRunId(),
        parentRunId: state.identity.runId,
        causalRunId: state.identity.causalRunId ?? state.identity.runId,
      });
    };
    const contextRequest: AgentStartRequest = Object.freeze({
      agent: request.agent,
      invocationContext: frozenPortable({
        ...request.invocationContext,
        runId: state.identity.runId,
      }),
      input: frozenPortable(request.input),
      ...(request.providerSession
        ? { providerSession: frozenPortable(request.providerSession) }
        : {}),
    });
    const context: LocalAgentExecutionContext = Object.freeze({
      identity: state.identity,
      request: contextRequest,
      cancellation: Object.freeze({
        isCancellationRequested: () => state.cancellationRequested,
      }),
      ...(options.controlledToolExecution
        ? {
            controlledToolExecution: checkpoint
              ? guardResumeToolExecution(options.controlledToolExecution, checkpoint)
              : options.controlledToolExecution,
          }
        : {}),
      emitProgress: (facts: AgentProgressFacts) => {
        if (!state.terminal) {
          emit(state, "agent.run.progress", facts);
        }
      },
      startChild,
      requestIntervention: (intervention: InterventionRequest) => {
        if (!capabilities.interventions) {
          throw new TypeError("This runner does not support interventions.");
        }
        if (intervention.intervention.runId !== state.identity.runId) {
          throw new TypeError("Intervention requests must bind to the active run.");
        }
        const copy = createInterventionRequest(intervention);
        const existing = state.interventionRequests.get(copy.intervention.interventionId);
        if (existing) {
          throw new TypeError("Intervention IDs cannot be rebound.");
        }
        const requestedEvent = buildEvent({
          state,
          kind: "agent.run.intervention.requested",
          facts: {
            interventionId: copy.intervention.interventionId,
            checkpointId: copy.intervention.checkpointId,
            checkpointRevision: copy.intervention.checkpointRevision,
            runId: copy.intervention.runId,
            stepId: copy.intervention.stepId,
            actionDigest: copy.intervention.actionDigest,
            requestedAt: copy.requestedAt,
            expiresAt: copy.expiresAt,
            allowed: copy.allowed,
          },
        });
        state.interventionRequests.set(copy.intervention.interventionId, copy);
        appendBuiltEvent(state, requestedEvent);
      },
      receivedInterventions: () => Object.freeze([...state.interventions]),
    });

    emit(state, "agent.run.started", {
      agentId: request.agent.agentId,
      agentVersion: request.agent.version,
    });
    if (deniedReason) {
      state.result = settle(state, { status: "denied", reasonCode: deniedReason });
      return run;
    }

    try {
      const execution = checkpoint
        ? options.program.resume?.({ context, checkpoint })
        : options.program.execute(context);
      if (!execution) {
        state.result = settle(state, {
          status: "denied",
          reasonCode: "checkpoint-resume-unsupported",
        });
      } else if (isPromiseLike(execution)) {
        state.result = Promise.resolve(execution)
          .then((draft) => settle(state, draft))
          .catch(() => failed(state));
      } else {
        state.result = settle(state, execution);
      }
    } catch {
      state.result = failed(state);
    }
    return run;
  };

  const startWithIdentity = (request: AgentStartRequest, identity: AgentRunIdentity): AgentRun =>
    createRun({ request, identity });

  const validateForRunner = (request: AgentStartRequest): void => {
    validateAgentStartRequest(request);
    if (!runnerPreparedDefinitions.has(request.agent)) {
      throw new TypeError("Agent definitions must be prepared by this runner instance.");
    }
    if (request.agent.effectRequirement === "controlled" && !capabilities.controlledEffects) {
      throw new TypeError("This runner cannot establish a controlled path for meaningful effects.");
    }
  };

  const prepare = (definition: AgentDefinition): PreparedAgentDefinition => {
    const prepared = createPreparedAgentDefinition(definition);
    if (prepared.effectRequirement === "controlled" && !capabilities.controlledEffects) {
      throw new TypeError("This runner cannot establish a controlled path for meaningful effects.");
    }
    runnerPreparedDefinitions.add(prepared);
    return prepared;
  };

  const start = (request: AgentStartRequest): AgentRun => {
    validateForRunner(request);
    const requestedRunId = request.invocationContext.runId;
    return startWithIdentity(request, {
      runId: requestedRunId ?? readRunId(),
    });
  };

  const resume = capabilities.checkpointResume
    ? (request: AgentResumeRequest): AgentRun => {
        if (!runnerPreparedDefinitions.has(request.agent)) {
          throw new TypeError("AgentResumeRequest.agent must be prepared by this runner.");
        }
        if (!isRegisteredResumableCheckpoint(request.checkpoint)) {
          throw new TypeError("AgentResumeRequest.checkpoint must be registered.");
        }
        const compatibility = checkResumeCompatibility(
          request.checkpoint,
          options.resumeCompatibility!,
        );
        const runId: RunId = request.invocationContext.runId ?? readRunId();
        const runRequest: AgentStartRequest = {
          agent: request.agent,
          invocationContext: request.invocationContext,
          input: request.checkpoint.state,
        };
        validateForRunner(runRequest);
        return createRun({
          request: runRequest,
          identity: { runId },
          checkpoint: request.checkpoint,
          deniedReason: compatibility.compatible ? undefined : `resume-${compatibility.reason}`,
        });
      }
    : undefined;

  return Object.freeze({
    capabilities: () => capabilities,
    prepare,
    start,
    ...(resume ? { resume } : {}),
  });
};
