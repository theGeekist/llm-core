import type { JsonValue } from "#contracts";
import { prepareAgentSpec } from "../../features/agent/public";
import type {
  AgentCancellationRequest,
  AgentResumeRequest,
  AgentRun,
  AgentRunEvent,
  AgentRunRequest,
  AgentRunner,
  AgentSpec,
  PreparedAgentSpec,
  RunResult,
} from "../../features/agent/public";
import type { InterventionDecision } from "../../features/state/public";
import { registerResumableCheckpoint } from "../../features/state/public";

export type FakeRemoteOperation =
  | "capabilities"
  | "prepare"
  | "start"
  | "events"
  | "result"
  | "cancel"
  | "intervene";

export interface DeterministicFakeRemoteOptions {
  /** Exact event sequences to deliver twice, modelling at-least-once replay. */
  readonly replayEventSequences?: readonly number[];
  /** Exact event sequences to omit, modelling an interrupted delivery stream. */
  readonly dropEventSequences?: readonly number[];
  /** Buffers and reverses the stream, modelling a broken ordering transport. */
  readonly reverseEventOrder?: boolean;
  /** Operations that deterministically fail before crossing the fake boundary. */
  readonly fail?: Readonly<Partial<Record<FakeRemoteOperation, string>>>;
}

export class FakeRemoteTransportError extends Error {
  readonly operation: FakeRemoteOperation;
  readonly code: string;

  constructor(operation: FakeRemoteOperation, code: string) {
    super(`Fake remote ${operation} failed with ${code}.`);
    this.name = "FakeRemoteTransportError";
    this.operation = operation;
    this.code = code;
  }
}

const portableClone = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    throw new TypeError("Fake remote boundaries accept portable structured-clone values only.");
  }
};

const invoke = <T>(
  operation: FakeRemoteOperation,
  options: DeterministicFakeRemoteOptions,
  callback: () => T,
): T => {
  const failure = options.fail?.[operation];
  if (failure) {
    throw new FakeRemoteTransportError(operation, failure);
  }
  return callback();
};

const projectEvents = async function* (
  remote: AgentRun,
  options: DeterministicFakeRemoteOptions,
): AsyncGenerator<AgentRunEvent> {
  const replaySequences = new Set(options.replayEventSequences ?? []);
  const dropSequences = new Set(options.dropEventSequences ?? []);
  const buffered: AgentRunEvent[] = [];
  for await (const event of remote.events()) {
    const projected = portableClone<AgentRunEvent>(event);
    if (dropSequences.has(projected.sequence)) {
      continue;
    }
    buffered.push(projected);
    if (replaySequences.has(projected.sequence)) {
      buffered.push(portableClone(projected));
    }
  }
  if (options.reverseEventOrder) {
    buffered.reverse();
  }
  yield* buffered;
};

/**
 * A deterministic serialization boundary around any runner.
 *
 * It deliberately does not pretend that a TypeScript call is a Python runtime.
 * Its purpose is to apply the same conformance fixtures to remote-shaped
 * execution, including transport failure and at-least-once event delivery.
 */
export const createDeterministicFakeRemoteRunner = (
  server: AgentRunner,
  options: DeterministicFakeRemoteOptions = {},
): AgentRunner => {
  const preparedTokens = new WeakMap<object, PreparedAgentSpec>();

  const prepare = async (spec: AgentSpec): Promise<PreparedAgentSpec> =>
    invoke("prepare", options, async () => {
      const remote = await server.prepare(portableClone(spec));
      const client = prepareAgentSpec(portableClone(spec));
      preparedTokens.set(client, remote);
      return client;
    });

  const wrapRun = (remote: AgentRun): AgentRun => {
    return Object.freeze({
      identity: portableClone(remote.identity),
      events: () => invoke("events", options, () => projectEvents(remote, options)),
      result: async (): Promise<RunResult> =>
        invoke("result", options, async () => portableClone(await remote.result())),
      cancel: async (request: AgentCancellationRequest) =>
        invoke("cancel", options, async () =>
          portableClone(await remote.cancel(portableClone(request))),
        ),
      intervene: async (decision: InterventionDecision) =>
        invoke("intervene", options, async () =>
          portableClone(await remote.intervene(portableClone(decision))),
        ),
    });
  };

  const start = async (request: AgentRunRequest): Promise<AgentRun> =>
    invoke("start", options, async () => {
      const remoteAgent = preparedTokens.get(request.agent);
      if (!remoteAgent) {
        throw new TypeError("Fake remote runner only accepts specs prepared by this boundary.");
      }
      const wire = portableClone<Omit<AgentRunRequest, "agent">>({
        invocationContext: request.invocationContext,
        input: request.input,
        ...(request.providerSession ? { providerSession: request.providerSession } : {}),
      });
      const remote = await server.start({ ...wire, agent: remoteAgent });
      return wrapRun(remote);
    });

  return Object.freeze({
    capabilities: async () =>
      invoke("capabilities", options, async () => portableClone(await server.capabilities())),
    prepare,
    start,
    ...(server.resume
      ? {
          resume: async (request: AgentResumeRequest) => {
            const remoteAgent = preparedTokens.get(request.agent);
            if (!remoteAgent) {
              throw new TypeError(
                "Fake remote runner only accepts specs prepared by this boundary.",
              );
            }
            const remote = await server.resume!({
              agent: remoteAgent,
              invocationContext: portableClone(request.invocationContext),
              checkpoint: registerResumableCheckpoint(portableClone(request.checkpoint)),
            });
            return wrapRun(remote);
          },
        }
      : {}),
  });
};

/** Compile-time guard against accidentally widening remote payloads to unknown objects. */
export type FakeRemotePortablePayload = JsonValue;
