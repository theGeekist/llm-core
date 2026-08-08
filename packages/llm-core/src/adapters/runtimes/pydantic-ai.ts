import { contractVersion, isUuidV7, type ContractVersion, type JsonValue } from "#contracts";
import type {
  AgentCancellationAcknowledgement,
  AgentCancellationRequest,
  AgentInterventionAcknowledgement,
  AgentRun,
  AgentResult,
  AgentStartRequest,
  AgentRunner,
  AgentRunnerProfile,
  AgentDefinition,
  PreparedAgentDefinition,
} from "../../features/agent/public";
import { createPreparedAgentDefinition } from "../../features/agent/public";
import type { InterventionDecision } from "../../features/state/public";
import type { PydanticAiNativeRunObservation } from "./pydantic-ai-native-result";
import {
  PYDANTIC_AI_BRIDGE_PROTOCOL,
  type PydanticAiBridgeHandshake,
  type RuntimeOperationDeclaration,
} from "./pydantic-ai-support";
import {
  PydanticAiCompatibilityError,
  TERMINAL_EVENT_KINDS,
  assertPydanticAiBridgeCompatible,
  clonePortable,
  hasPydanticAiOperationMatrix,
  payloadRecord,
  pydanticAiPromptInput,
  registerPydanticAiSpec,
  stringField,
  supportedPythonVersion,
  validatePydanticAiEvent,
  validatePydanticAiNativeResult,
  validatePydanticAiResult,
} from "./pydantic-ai-validation";

export { PydanticAiCompatibilityError, assertPydanticAiBridgeCompatible };

export type PydanticAiBridgeOperation =
  | "handshake"
  | "prepare"
  | "start"
  | "events"
  | "result"
  | "native-result"
  | "native-typed-output"
  | "native-events"
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

export interface PydanticAiAgentRun extends AgentRun {
  nativeResult(): Promise<PydanticAiNativeRunObservation>;
}

export interface PydanticAiBridgeRunner extends AgentRunner {
  start(request: AgentStartRequest): Promise<PydanticAiAgentRun>;
}

const capabilities: AgentRunnerProfile = Object.freeze({
  runnerId: "llm-core.runtime.pydantic-ai",
  runnerVersion: contractVersion("2.0.0"),
  controlledEffects: false,
  cancellation: "none",
  interventions: false,
  checkpointResume: false,
  providerSessionContinuation: false,
  durableExecutionSignalling: false,
  childRuns: false,
});

/**
 * Creates a bounded PydanticAI v2 runner over an injected transport.
 *
 * The transport may be stdio, HTTP, a queue, or an in-memory test server; none
 * of those provider details escape this adapter. The Python peer must return
 * the exact operation matrix above before any run is prepared.
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
        operations: payload.operations as unknown as readonly RuntimeOperationDeclaration[],
      };
      if (requirePydanticAi) {
        assertPydanticAiBridgeCompatible(handshake);
      } else if (
        handshake.protocol !== PYDANTIC_AI_BRIDGE_PROTOCOL ||
        !supportedPythonVersion(handshake.pythonVersion) ||
        !hasPydanticAiOperationMatrix(handshake.operations)
      ) {
        throw new PydanticAiCompatibilityError(
          "python-transport-handshake-mismatch",
          "The Python conformance transport returned an incompatible handshake.",
        );
      }
    })();
    return handshakePromise;
  };

  const runHandle = (runId: string): AgentRun => {
    let terminalResult: Promise<AgentResult> | undefined;
    const result = (): Promise<AgentResult> => {
      terminalResult ??= exchange("result", { runId }).then((payload) =>
        validatePydanticAiResult(payload, runId),
      );
      return terminalResult;
    };

    return Object.freeze({
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
            const validated = validatePydanticAiEvent(event, runId, sequence);
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
      result,
      ...(requirePydanticAi
        ? {
            nativeResult: async () => {
              const portable = await result();
              if (portable.output?.kind !== "text") {
                throw new PydanticAiCompatibilityError(
                  "portable-result-unavailable",
                  "PydanticAI native results require the correlated portable text result.",
                );
              }
              return validatePydanticAiNativeResult(
                await exchange("native-result", { runId }),
                runId,
                portable.output.text,
              );
            },
          }
        : {}),
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
  };

  return Object.freeze({
    capabilities: async () => {
      await ensureHandshake();
      return capabilities;
    },
    prepare: async (spec: AgentDefinition): Promise<PreparedAgentDefinition> => {
      await ensureHandshake();
      const registered = registerPydanticAiSpec(spec);
      const payload = payloadRecord(
        await exchange("prepare", { spec: registered as unknown as JsonValue }),
        "prepare",
      );
      const token = stringField(payload.token, "token", "prepare");
      const prepared = createPreparedAgentDefinition(registered);
      tokens.set(prepared, token);
      return prepared;
    },
    start: async (request: AgentStartRequest): Promise<AgentRun> => {
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
      const input = pydanticAiPromptInput(request.input);
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

export const createPydanticAiBridgeRunner = (
  transport: PydanticAiBridgeTransport,
): PydanticAiBridgeRunner => createBridgeRunner(transport, true) as PydanticAiBridgeRunner;

/**
 * Executes runner fixtures across a real Python process without claiming that
 * the optional PydanticAI package itself was present or tested.
 */
export const createPythonTransportConformanceRunner = (
  transport: PydanticAiBridgeTransport,
): AgentRunner => createBridgeRunner(transport, false);

export type PydanticAiBridgeContractVersion = ContractVersion;
