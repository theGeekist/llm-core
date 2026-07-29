import { contractVersion, isUuidV7, type ContractVersion, type JsonValue } from "#contracts";
import { prepareAgentSpec } from "../../features/agent/public";
import type {
  AgentCancellationAcknowledgement,
  AgentCancellationRequest,
  AgentInterventionAcknowledgement,
  AgentRun,
  AgentRunEvent,
  AgentRunRequest,
  AgentRunner,
  AgentRunnerCapabilities,
  AgentSpec,
  PreparedAgentSpec,
  RunResult,
} from "../../features/agent/public";
import type { InterventionDecision } from "../../features/state/public";
import {
  PYDANTIC_AI_BRIDGE_PROTOCOL,
  PYDANTIC_AI_MINIMUM_MINOR,
  PYDANTIC_AI_SEMANTICS,
  PYDANTIC_AI_SUPPORTED_MAJOR,
  type PydanticAiBridgeHandshake,
  type RuntimeSupportDeclaration,
} from "./pydantic-ai-support";

export type PydanticAiBridgeOperation =
  | "handshake"
  | "prepare"
  | "start"
  | "events"
  | "result"
  | "cancel"
  | "intervene";

export interface PydanticAiBridgeRequest {
  readonly protocol: typeof PYDANTIC_AI_BRIDGE_PROTOCOL;
  readonly operation: PydanticAiBridgeOperation;
  readonly payload: JsonValue;
}

export interface PydanticAiBridgeResponse {
  readonly protocol: typeof PYDANTIC_AI_BRIDGE_PROTOCOL;
  readonly operation: PydanticAiBridgeOperation;
  readonly ok: boolean;
  readonly payload?: JsonValue;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface PydanticAiBridgeTransport {
  exchange(request: PydanticAiBridgeRequest): Promise<PydanticAiBridgeResponse>;
}

export class PydanticAiCompatibilityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PydanticAiCompatibilityError";
    this.code = code;
  }
}

function parseVersion(value: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[+-].*)?$/.exec(value);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const sameDeclaration = (
  actual: readonly RuntimeSupportDeclaration[],
  expected: readonly RuntimeSupportDeclaration[],
): boolean => JSON.stringify(actual) === JSON.stringify(expected);

const supportedPythonVersion = (value: string): boolean => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[+-].*)?$/.exec(value);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 3 && minor >= 10 && minor < 15;
};

export const assertPydanticAiBridgeCompatible = (handshake: PydanticAiBridgeHandshake): void => {
  if (handshake.protocol !== PYDANTIC_AI_BRIDGE_PROTOCOL) {
    throw new PydanticAiCompatibilityError(
      "protocol-mismatch",
      `Expected ${PYDANTIC_AI_BRIDGE_PROTOCOL}.`,
    );
  }
  if (!handshake.pydanticAiAvailable) {
    throw new PydanticAiCompatibilityError(
      "pydantic-ai-unavailable",
      "The Python process is reachable, but PydanticAI is not installed.",
    );
  }
  if (!supportedPythonVersion(handshake.pythonVersion)) {
    throw new PydanticAiCompatibilityError(
      "unsupported-python-version",
      `Python ${handshake.pythonVersion} is outside >=3.10 <3.15.`,
    );
  }
  const version = parseVersion(handshake.pydanticAiVersion);
  if (
    !version ||
    version[0] !== PYDANTIC_AI_SUPPORTED_MAJOR ||
    version[1] !== PYDANTIC_AI_MINIMUM_MINOR ||
    version[2] !== 0
  ) {
    throw new PydanticAiCompatibilityError(
      "unsupported-pydantic-ai-version",
      `PydanticAI ${handshake.pydanticAiVersion} is not the assessed 2.19.0 release.`,
    );
  }
  if (!sameDeclaration(handshake.semantics, PYDANTIC_AI_SEMANTICS)) {
    throw new PydanticAiCompatibilityError(
      "semantic-declaration-mismatch",
      "The Python bridge semantic declaration does not match this adapter.",
    );
  }
};

const clonePortable = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    throw new PydanticAiCompatibilityError(
      "non-portable-payload",
      "PydanticAI bridge payloads must be structured-cloneable portable values.",
    );
  }
};

const payloadRecord = (
  value: JsonValue | undefined,
  operation: string,
): Record<string, JsonValue> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PydanticAiCompatibilityError(
      "malformed-response",
      `PydanticAI ${operation} returned a non-object payload.`,
    );
  }
  return value;
};

const stringField = (value: JsonValue | undefined, field: string, operation: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new PydanticAiCompatibilityError(
      "malformed-response",
      `PydanticAI ${operation} returned an invalid ${field}.`,
    );
  }
  return value;
};

const capabilities: AgentRunnerCapabilities = Object.freeze({
  runnerId: "llm-core.runtime.pydantic-ai",
  runnerVersion: contractVersion("1.0.0"),
  controlledEffects: false,
  cancellation: "none",
  interventions: false,
  checkpointResume: false,
  providerSessionContinuation: false,
  durableExecutionSignalling: false,
  childRuns: false,
});

const EVENT_KINDS = new Set<AgentRunEvent["kind"]>([
  "agent.run.started",
  "agent.run.progress",
  "agent.run.completed",
  "agent.run.failed",
  "agent.run.denied",
  "agent.run.cancelled",
]);

const TERMINAL_EVENT_KINDS = new Set<AgentRunEvent["kind"]>([
  "agent.run.completed",
  "agent.run.failed",
  "agent.run.denied",
  "agent.run.cancelled",
]);

const validEventFacts = (
  kind: AgentRunEvent["kind"],
  facts: Record<string, JsonValue>,
): boolean => {
  switch (kind) {
    case "agent.run.started":
      return typeof facts.agentId === "string" && typeof facts.agentVersion === "string";
    case "agent.run.progress":
      return typeof facts.code === "string" && Object.keys(facts).length === 1;
    case "agent.run.completed":
      return facts.status === "completed";
    case "agent.run.failed":
      return facts.status === "failed";
    case "agent.run.denied":
      return facts.status === "denied";
    case "agent.run.cancelled":
      return facts.status === "cancelled";
    default:
      return false;
  }
};

const validateEvent = (
  value: JsonValue,
  runId: string,
  expectedSequence: number,
): AgentRunEvent => {
  const record = payloadRecord(value, "events");
  const kind = record.kind as AgentRunEvent["kind"];
  if (
    !isUuidV7(record.eventId) ||
    !EVENT_KINDS.has(kind) ||
    record.sequence !== expectedSequence ||
    typeof record.occurredAt !== "string" ||
    !record.occurredAt.endsWith("Z") ||
    !record.facts ||
    typeof record.facts !== "object" ||
    Array.isArray(record.facts)
  ) {
    throw new PydanticAiCompatibilityError(
      "malformed-event",
      "PydanticAI emitted an unknown, malformed, duplicated, dropped, or reordered event.",
    );
  }
  if (!validEventFacts(kind, record.facts as Record<string, JsonValue>)) {
    throw new PydanticAiCompatibilityError(
      "malformed-event-facts",
      "PydanticAI emitted facts that do not match the projected lifecycle event.",
    );
  }
  const identity = payloadRecord(record.identity, "events");
  if (identity.runId !== runId) {
    throw new PydanticAiCompatibilityError(
      "event-identity-mismatch",
      "PydanticAI emitted an event for a different run.",
    );
  }
  return clonePortable(record) as unknown as AgentRunEvent;
};

const validateResult = (value: JsonValue | undefined, runId: string): RunResult => {
  const record = payloadRecord(value, "result");
  const identity = payloadRecord(record.identity, "result");
  if (
    identity.runId !== runId ||
    !["completed", "failed", "denied", "cancelled"].includes(String(record.status))
  ) {
    throw new PydanticAiCompatibilityError(
      "malformed-result",
      "PydanticAI returned an invalid terminal result.",
    );
  }
  return clonePortable(record) as unknown as RunResult;
};

const validatePydanticAiSpec = (spec: AgentSpec): void => {
  if (spec.effectRequirement === "controlled") {
    throw new PydanticAiCompatibilityError(
      "controlled-effects-unsupported",
      "PydanticAI deferred calls do not satisfy llm-core controlled-effect semantics.",
    );
  }
  if (spec.skills?.length) {
    throw new PydanticAiCompatibilityError(
      "skills-unsupported",
      "The bounded PydanticAI bridge does not project llm-core skill references.",
    );
  }
  if (spec.metadata && Object.keys(spec.metadata).length > 0) {
    throw new PydanticAiCompatibilityError(
      "metadata-unsupported",
      "The bounded PydanticAI bridge does not project arbitrary agent metadata.",
    );
  }
  if (spec.instructions.includes("{{") || spec.instructions.includes("}}")) {
    throw new PydanticAiCompatibilityError(
      "templates-unsupported",
      "The bounded PydanticAI bridge accepts literal instructions only.",
    );
  }
};

const promptInput = (input: JsonValue): { readonly prompt: string } => {
  const record = payloadRecord(input, "start");
  if (
    Object.keys(record).length !== 1 ||
    typeof record.prompt !== "string" ||
    record.prompt.length === 0
  ) {
    throw new PydanticAiCompatibilityError(
      "input-shape-unsupported",
      "The bounded PydanticAI bridge accepts only { prompt: string } input.",
    );
  }
  return { prompt: record.prompt };
};

/**
 * Creates a bounded PydanticAI v2 runner over an injected transport.
 *
 * The transport may be stdio, HTTP, a queue, or an in-memory test server; none
 * of those provider details escape this adapter. The Python peer must return
 * the exact semantic declaration above before any run is prepared.
 */
const createBridgeRunner = (
  transport: PydanticAiBridgeTransport,
  requirePydanticAi: boolean,
): AgentRunner => {
  const tokens = new WeakMap<object, string>();
  let handshakePromise: Promise<void> | undefined;

  const exchange = async (
    operation: PydanticAiBridgeOperation,
    payload: JsonValue,
  ): Promise<JsonValue | undefined> => {
    const response = await transport.exchange({
      protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
      operation,
      payload: clonePortable(payload),
    });
    if (response.protocol !== PYDANTIC_AI_BRIDGE_PROTOCOL || response.operation !== operation) {
      throw new PydanticAiCompatibilityError(
        "response-correlation-failed",
        `PydanticAI ${operation} response did not correlate to its request.`,
      );
    }
    if (!response.ok) {
      throw new PydanticAiCompatibilityError(
        response.error?.code ?? "remote-error",
        response.error?.message ?? `PydanticAI ${operation} failed.`,
      );
    }
    return clonePortable(response.payload);
  };

  const ensureHandshake = async (): Promise<void> => {
    handshakePromise ??= (async () => {
      const payload = payloadRecord(await exchange("handshake", {}), "handshake");
      const handshake: PydanticAiBridgeHandshake = {
        protocol: stringField(
          payload.protocol,
          "protocol",
          "handshake",
        ) as typeof PYDANTIC_AI_BRIDGE_PROTOCOL,
        pythonVersion: stringField(payload.pythonVersion, "pythonVersion", "handshake"),
        pydanticAiVersion: stringField(payload.pydanticAiVersion, "pydanticAiVersion", "handshake"),
        pydanticAiAvailable: payload.pydanticAiAvailable === true,
        semantics: payload.semantics as unknown as readonly RuntimeSupportDeclaration[],
      };
      if (requirePydanticAi) {
        assertPydanticAiBridgeCompatible(handshake);
      } else if (
        handshake.protocol !== PYDANTIC_AI_BRIDGE_PROTOCOL ||
        !supportedPythonVersion(handshake.pythonVersion) ||
        !sameDeclaration(handshake.semantics, PYDANTIC_AI_SEMANTICS)
      ) {
        throw new PydanticAiCompatibilityError(
          "python-transport-handshake-mismatch",
          "The Python conformance transport returned an incompatible handshake.",
        );
      }
    })();
    return handshakePromise;
  };

  const runHandle = (runId: string): AgentRun =>
    Object.freeze({
      identity: { runId: runId as AgentRun["identity"]["runId"] },
      events: () => ({
        async *[Symbol.asyncIterator]() {
          const payload = await exchange("events", { runId });
          if (!Array.isArray(payload)) {
            throw new PydanticAiCompatibilityError(
              "malformed-response",
              "PydanticAI events returned a non-array payload.",
            );
          }
          let sequence = 0;
          let terminalSeen = false;
          for (const event of payload) {
            if (terminalSeen) {
              throw new PydanticAiCompatibilityError(
                "event-after-terminal",
                "PydanticAI emitted an event after the terminal event.",
              );
            }
            const validated = validateEvent(event, runId, sequence);
            terminalSeen = TERMINAL_EVENT_KINDS.has(validated.kind);
            sequence += 1;
            yield validated;
          }
          if (!terminalSeen) {
            throw new PydanticAiCompatibilityError(
              "missing-terminal-event",
              "PydanticAI event delivery ended without a terminal event.",
            );
          }
        },
      }),
      result: async () => validateResult(await exchange("result", { runId }), runId),
      cancel: async (
        _request: AgentCancellationRequest,
      ): Promise<AgentCancellationAcknowledgement> => {
        throw new PydanticAiCompatibilityError(
          "cancellation-unsupported",
          "The bounded PydanticAI bridge has no live in-flight cancellation channel.",
        );
      },
      intervene: async (
        _decision: InterventionDecision,
      ): Promise<AgentInterventionAcknowledgement> => {
        throw new PydanticAiCompatibilityError(
          "interventions-unsupported",
          "PydanticAI deferred calls are not llm-core authenticated interventions.",
        );
      },
    });

  return Object.freeze({
    capabilities: async () => {
      await ensureHandshake();
      return capabilities;
    },
    prepare: async (spec: AgentSpec): Promise<PreparedAgentSpec> => {
      await ensureHandshake();
      validatePydanticAiSpec(spec);
      const payload = payloadRecord(
        await exchange("prepare", { spec: spec as unknown as JsonValue }),
        "prepare",
      );
      const token = stringField(payload.token, "token", "prepare");
      const prepared = prepareAgentSpec(clonePortable(spec));
      tokens.set(prepared, token);
      return prepared;
    },
    start: async (request: AgentRunRequest): Promise<AgentRun> => {
      await ensureHandshake();
      const token = tokens.get(request.agent);
      if (!token) {
        throw new PydanticAiCompatibilityError(
          "unrecognized-prepared-spec",
          "The run spec was not prepared by this PydanticAI bridge instance.",
        );
      }
      if (request.providerSession) {
        throw new PydanticAiCompatibilityError(
          "provider-session-unsupported",
          "PydanticAI message history is not an llm-core provider session.",
        );
      }
      const input = promptInput(request.input);
      const payload = payloadRecord(
        await exchange("start", {
          token,
          invocationContext: request.invocationContext as unknown as JsonValue,
          input,
        }),
        "start",
      );
      const runId = stringField(payload.runId, "runId", "start");
      if (!isUuidV7(runId)) {
        throw new PydanticAiCompatibilityError(
          "malformed-run-id",
          "PydanticAI start returned a run ID that is not UUIDv7.",
        );
      }
      return runHandle(runId);
    },
  });
};

export const createPydanticAiBridgeRunner = (transport: PydanticAiBridgeTransport): AgentRunner =>
  createBridgeRunner(transport, true);

/**
 * Executes runner fixtures across a real Python process without claiming that
 * the optional PydanticAI package itself was present or tested.
 */
export const createPythonTransportConformanceRunner = (
  transport: PydanticAiBridgeTransport,
): AgentRunner => createBridgeRunner(transport, false);

export type PydanticAiBridgeContractVersion = ContractVersion;
