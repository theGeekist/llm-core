import { newCoreId, type EventId, type RunId } from "#contracts";
import { cloneFrozen, isPortableRecord } from "#shared/portable-data";
import {
  createPreparedAgentDefinition,
  registerAgentOutput,
  type AgentCancellationAcknowledgement,
  type AgentCancellationRequest,
  type AgentDefinition,
  type AgentEvent,
  type AgentInterventionAcknowledgement,
  type AgentResult,
  type AgentRun,
  type AgentRunner,
  type AgentStartRequest,
  type PreparedAgentDefinition,
} from "../../features/agent/public";
import { LangGraphEventLog } from "./event-log";
import {
  langGraphRuntimeOperations,
  langGraphRuntimeProfile,
  langGraphRuntimeSourceContract,
} from "./profile";
import type {
  LangGraphNativeErrorObservation,
  LangGraphNativeRunObservation,
  LangGraphNativeRunStatus,
  LangGraphNativeStateObservation,
  LangGraphRuntimeOptions,
  LangGraphRunnableConfig,
} from "./protocol";
import {
  isCanonicalTimestamp,
  validateLangGraphCancellation,
  validateLangGraphDefinition,
  validateLangGraphStartRequest,
} from "./validation";

export class LangGraphRuntimeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`LangGraph runtime operation failed with ${code}.`);
    this.name = "LangGraphRuntimeError";
    this.code = code;
  }
}

const exactSource = (source: LangGraphRuntimeOptions["sourceContract"]): boolean =>
  source.authority === langGraphRuntimeSourceContract.authority &&
  source.version === langGraphRuntimeSourceContract.version &&
  source.revision === langGraphRuntimeSourceContract.revision;

const dataRecord = (value: unknown, operation: string): Record<string, unknown> => {
  if (!isPortableRecord(value)) {
    throw new LangGraphRuntimeError(`${operation}-malformed`);
  }
  return value;
};

const readTime = (options: LangGraphRuntimeOptions): string => {
  const value = options.identity.now();
  if (!isCanonicalTimestamp(value)) throw new LangGraphRuntimeError("invalid-timestamp");
  return value;
};

const stateObservation = (input: {
  readonly sourceContract: LangGraphRuntimeOptions["sourceContract"];
  readonly threadId: string;
  readonly status: LangGraphNativeRunStatus;
  readonly snapshot: unknown;
}): LangGraphNativeStateObservation => {
  const state = dataRecord(input.snapshot, "state");
  if (!Array.isArray(state.next) || !state.next.every((item) => typeof item === "string")) {
    throw new LangGraphRuntimeError("state-next-malformed");
  }
  if (!Array.isArray(state.tasks)) throw new LangGraphRuntimeError("state-tasks-malformed");
  let interruptCount = 0;
  for (const candidate of state.tasks) {
    const task = dataRecord(candidate, "state-task");
    if (!Array.isArray(task.interrupts)) {
      throw new LangGraphRuntimeError("state-interrupts-malformed");
    }
    interruptCount += task.interrupts.length;
  }
  const config = dataRecord(state.config, "state-config");
  const configurable = dataRecord(config.configurable, "state-configurable");
  const checkpointId = configurable.checkpoint_id;
  if (checkpointId !== undefined && typeof checkpointId !== "string") {
    throw new LangGraphRuntimeError("state-checkpoint-malformed");
  }
  return Object.freeze({
    sourceContract: input.sourceContract,
    threadId: input.threadId,
    status: input.status,
    stateAvailability: "available",
    ...(checkpointId === undefined ? {} : { checkpointId }),
    next: Object.freeze([...state.next]),
    interruptCount,
  });
};

const errorObservation = (input: {
  readonly sourceContract: LangGraphRuntimeOptions["sourceContract"];
  readonly threadId: string;
  readonly status: LangGraphNativeRunStatus;
  readonly operation: LangGraphNativeErrorObservation["nativeError"]["operation"];
  readonly code: LangGraphNativeErrorObservation["nativeError"]["code"];
}): LangGraphNativeErrorObservation =>
  Object.freeze({
    sourceContract: input.sourceContract,
    threadId: input.threadId,
    status: input.status,
    stateAvailability: "unavailable",
    nativeError: Object.freeze({ operation: input.operation, code: input.code }),
  });

const interruptCountFromResult = (value: unknown): number => {
  const result = dataRecord(value, "result");
  if (!("__interrupt__" in result)) return 0;
  if (!Array.isArray(result.__interrupt__)) {
    throw new LangGraphRuntimeError("result-interrupts-malformed");
  }
  return result.__interrupt__.length;
};

const isAbortError = (value: unknown): boolean =>
  value instanceof DOMException && value.name === "AbortError";

const readNativeObservation = async (input: {
  readonly options: LangGraphRuntimeOptions;
  readonly threadId: string;
  readonly config: LangGraphRunnableConfig;
}): Promise<LangGraphNativeRunObservation> => {
  if (input.options.graph.getState !== undefined) {
    try {
      const snapshot = await input.options.graph.getState({
        configurable: input.config.configurable,
      });
      return stateObservation({
        sourceContract: input.options.sourceContract,
        threadId: input.threadId,
        status: "completed",
        snapshot,
      });
    } catch {
      // State inspection is a separate optional native operation.
    }
  }
  return errorObservation({
    sourceContract: input.options.sourceContract,
    threadId: input.threadId,
    status: "completed",
    operation: "native.langgraph.state.read",
    code: "state-unavailable",
  });
};

const successfulInvocation = (input: {
  readonly nativeResult: unknown;
  readonly observation: LangGraphNativeRunObservation;
  readonly runId: RunId;
}): { readonly result: AgentResult; readonly observation: LangGraphNativeRunObservation } => {
  let interrupted: boolean;
  try {
    interrupted =
      interruptCountFromResult(input.nativeResult) > 0 ||
      (input.observation.stateAvailability === "available" &&
        (input.observation.next.length > 0 || input.observation.interruptCount > 0));
  } catch {
    return {
      observation: input.observation,
      result: {
        identity: { runId: input.runId },
        status: "failed",
        reasonCode: "langgraph-native-result-invalid",
      },
    };
  }
  if (interrupted) {
    return {
      observation: Object.freeze({ ...input.observation, status: "interrupted" as const }),
      result: {
        identity: { runId: input.runId },
        status: "failed",
        reasonCode: "langgraph-interrupted",
      },
    };
  }
  try {
    const output = dataRecord(input.nativeResult, "result").output;
    return {
      observation: input.observation,
      result: {
        identity: { runId: input.runId },
        status: "completed",
        output: registerAgentOutput(output),
      },
    };
  } catch {
    return {
      observation: input.observation,
      result: {
        identity: { runId: input.runId },
        status: "failed",
        reasonCode: "langgraph-invalid-output",
      },
    };
  }
};

const event = (input: {
  readonly eventId: EventId;
  readonly kind: AgentEvent["kind"];
  readonly occurredAt: string;
  readonly sequence: number;
  readonly runId: RunId;
  readonly facts: AgentEvent["facts"];
}): AgentEvent =>
  ({
    eventId: input.eventId,
    kind: input.kind,
    occurredAt: input.occurredAt,
    sequence: input.sequence,
    identity: { runId: input.runId },
    facts: input.facts,
  }) as AgentEvent;

export interface LangGraphRunner extends AgentRunner {
  readonly operations: typeof langGraphRuntimeOperations;
  capabilities(): typeof langGraphRuntimeProfile;
  prepare(definition: AgentDefinition): PreparedAgentDefinition;
  start(request: AgentStartRequest): AgentRun;
  observe(run: AgentRun): Promise<LangGraphNativeRunObservation>;
  nativeEvents(run: AgentRun): never;
}

export const createLangGraphRunner = (options: LangGraphRuntimeOptions): LangGraphRunner => {
  if (!exactSource(options.sourceContract)) throw new LangGraphRuntimeError("version-drift");
  const sourceContract = langGraphRuntimeSourceContract;
  const prepared = new WeakSet<object>();
  const observations = new WeakMap<AgentRun, Promise<LangGraphNativeRunObservation>>();

  const prepare = (definition: AgentDefinition): PreparedAgentDefinition => {
    validateLangGraphDefinition(definition);
    const snapshot = cloneFrozen(definition);
    if (snapshot.effectRequirement !== "read-only") {
      throw new LangGraphRuntimeError("controlled-effects-unsupported");
    }
    const value = createPreparedAgentDefinition(snapshot);
    prepared.add(value);
    return value;
  };

  const start = (request: AgentStartRequest): AgentRun => {
    validateLangGraphStartRequest(request);
    if (!prepared.has(request.agent)) {
      throw new TypeError("LangGraph accepts only definitions prepared by this runner.");
    }
    cloneFrozen(request.invocationContext);
    const input = cloneFrozen(request.input);
    const runId = newCoreId<RunId>(options.identity.runId());
    const threadId = runId;
    const controller = new AbortController();
    const config: LangGraphRunnableConfig = {
      configurable: { thread_id: threadId },
      signal: controller.signal,
    };
    const log = new LangGraphEventLog<AgentEvent>();
    let sequence = 0;
    let settled = false;
    const terminalEventId = newCoreId<EventId>(options.identity.eventId());
    const startedAt = readTime(options);
    log.append(
      event({
        eventId: newCoreId<EventId>(options.identity.eventId()),
        kind: "agent.run.started",
        occurredAt: startedAt,
        sequence: sequence++,
        runId,
        facts: { agentId: request.agent.agentId, agentVersion: request.agent.version },
      }),
    );

    const observation = Promise.withResolvers<LangGraphNativeRunObservation>();
    const execution = (async (): Promise<AgentResult> => {
      let nativeResult: unknown;
      try {
        nativeResult = await options.graph.invoke(
          {
            agentId: request.agent.agentId,
            agentVersion: request.agent.version,
            instructions: request.agent.instructions,
            input,
          },
          config,
        );
      } catch (cause) {
        const cancelled = controller.signal.aborted && isAbortError(cause);
        const status: AgentResult["status"] = cancelled ? "cancelled" : "failed";
        const reasonCode = cancelled ? "langgraph-cancelled" : "langgraph-execution-failed";
        observation.resolve(
          errorObservation({
            sourceContract,
            threadId,
            status,
            operation: "native.langgraph.graph.invoke",
            code: cancelled ? "abort" : "invocation-rejected",
          }),
        );
        return {
          identity: { runId },
          status,
          reasonCode,
        };
      }

      const projected = await readNativeObservation({
        options: { ...options, sourceContract },
        threadId,
        config,
      });
      const outcome = successfulInvocation({ nativeResult, observation: projected, runId });
      observation.resolve(outcome.observation);
      return outcome.result;
    })().then((candidate) => {
      let occurredAt = startedAt;
      let result = candidate;
      try {
        occurredAt = readTime(options);
      } catch {
        result = {
          identity: { runId },
          status: "failed",
          reasonCode: "langgraph-identity-time-failed",
        };
      }
      log.append(
        event({
          eventId: terminalEventId,
          kind: `agent.run.${result.status}`,
          occurredAt,
          sequence: sequence++,
          runId,
          facts: {
            status: result.status,
            ...(result.reasonCode === undefined ? {} : { reasonCode: result.reasonCode }),
          },
        }),
      );
      settled = true;
      log.close();
      return Object.freeze(result);
    });

    const run: AgentRun = Object.freeze({
      identity: Object.freeze({ runId }),
      events: () => log.stream(),
      result: () => execution,
      cancel: (candidate: AgentCancellationRequest): AgentCancellationAcknowledgement => {
        validateLangGraphCancellation(candidate);
        const acknowledgedAt = readTime(options);
        if (settled) return { status: "already-terminal", acknowledgedAt };
        const requested = event({
          eventId: newCoreId<EventId>(options.identity.eventId()),
          kind: "agent.run.cancellation.requested",
          occurredAt: acknowledgedAt,
          sequence,
          runId,
          facts: {
            requestedAt: candidate.requestedAt,
            reasonProvided: candidate.reason !== undefined,
          },
        });
        const acknowledged = event({
          eventId: newCoreId<EventId>(options.identity.eventId()),
          kind: "agent.run.cancellation.acknowledged",
          occurredAt: acknowledgedAt,
          sequence: sequence + 1,
          runId,
          facts: { acknowledgedAt },
        });
        log.append(requested);
        log.append(acknowledged);
        sequence += 2;
        controller.abort();
        return { status: "acknowledged", acknowledgedAt };
      },
      intervene: (): AgentInterventionAcknowledgement => ({
        status: "unsupported",
        acknowledgedAt: readTime(options),
      }),
    });
    observations.set(run, observation.promise);
    return run;
  };

  return Object.freeze({
    operations: langGraphRuntimeOperations,
    capabilities: () => langGraphRuntimeProfile,
    prepare,
    start,
    observe: async (run: AgentRun) => {
      const value = observations.get(run);
      if (!value) throw new TypeError("LangGraph can observe only runs created by this runner.");
      return value;
    },
    nativeEvents: () => {
      throw new LangGraphRuntimeError("native-event-stream-unsupported");
    },
  });
};
