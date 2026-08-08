import { contractVersion, newCoreId, type InvocationId, type JsonValue } from "#contracts";
import {
  createPydanticAiBridgeRunner,
  PYDANTIC_AI_ASSESSED_VERSION,
  PYDANTIC_AI_BRIDGE_PROTOCOL,
  PYDANTIC_AI_OPERATIONS,
  type PydanticAiBridgeHandshake,
  type PydanticAiBridgeTransport,
  type PydanticAiNativeRunObservation,
} from "../../src/adapters/runtimes/public";

export const RUN_ID = "018f0f4e-8c5b-7a91-8c3b-123456789e02";

export const baseDefinition = {
  agentId: "bounded-agent",
  version: contractVersion("2.0.0"),
  instructions: "Literal instructions.",
  effectRequirement: "read-only" as const,
};

export const handshake = (
  overrides: Partial<PydanticAiBridgeHandshake> = {},
): PydanticAiBridgeHandshake => ({
  protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
  pythonVersion: "3.14.6",
  pydanticAiVersion: PYDANTIC_AI_ASSESSED_VERSION,
  pydanticAiAvailable: true,
  operations: PYDANTIC_AI_OPERATIONS,
  ...overrides,
});

const usage = () => ({
  cache_audio_read_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  details: {},
  input_audio_tokens: 0,
  input_tokens: 51,
  output_audio_tokens: 0,
  output_tokens: 9,
});

export const nativeObservation = (): PydanticAiNativeRunObservation => ({
  runtime: "pydantic-ai",
  runtimeVersion: "2.19.0",
  native: {
    output: '{"echo":"a"}',
    toolNames: ["echo"],
    messageHistory: [
      {
        conversation_id: "conversation-1",
        instructions: "Literal instructions.",
        kind: "request",
        metadata: null,
        parts: [{ content: "hello", part_kind: "user-prompt", timestamp: "2026-08-08T00:00:00Z" }],
        run_id: "native-run-1",
        state: "complete",
        timestamp: "2026-08-08T00:00:00Z",
      },
      {
        conversation_id: "conversation-1",
        finish_reason: null,
        kind: "response",
        metadata: null,
        model_name: "test",
        parts: [
          {
            args: { value: "a" },
            id: null,
            part_kind: "tool-call",
            provider_details: null,
            provider_name: null,
            tool_call_id: "call-1",
            tool_kind: null,
            tool_name: "echo",
          },
        ],
        provider_details: null,
        provider_name: "test",
        provider_response_id: null,
        provider_url: null,
        run_id: "native-run-1",
        state: "complete",
        timestamp: "2026-08-08T00:00:00Z",
        usage: usage(),
      },
      {
        conversation_id: "conversation-1",
        instructions: "Literal instructions.",
        kind: "request",
        metadata: null,
        parts: [
          {
            content: "a",
            metadata: null,
            outcome: "success",
            part_kind: "tool-return",
            timestamp: "2026-08-08T00:00:00Z",
            tool_call_id: "call-1",
            tool_kind: null,
            tool_name: "echo",
          },
        ],
        run_id: "native-run-1",
        state: "complete",
        timestamp: "2026-08-08T00:00:00Z",
      },
      {
        conversation_id: "conversation-1",
        finish_reason: null,
        kind: "response",
        metadata: null,
        model_name: "test",
        parts: [
          {
            content: '{"echo":"a"}',
            id: null,
            part_kind: "text",
            provider_details: null,
            provider_name: null,
          },
        ],
        provider_details: null,
        provider_name: "test",
        provider_response_id: null,
        provider_url: null,
        run_id: "native-run-1",
        state: "complete",
        timestamp: "2026-08-08T00:00:00Z",
        usage: usage(),
      },
    ],
  },
});

export const nativeEnvelope = (
  observation: PydanticAiNativeRunObservation = nativeObservation(),
  runId = RUN_ID,
): JsonValue => ({
  identity: { runId },
  observation: observation as unknown as JsonValue,
});

export const lifecycleEvents = (): JsonValue[] => [
  {
    eventId: "018f0f4e-8c5b-7a91-8c3b-123456789e03",
    kind: "agent.run.started",
    occurredAt: "2026-08-08T00:00:00.000Z",
    sequence: 0,
    identity: { runId: RUN_ID },
    facts: { agentId: "bounded-agent", agentVersion: "2.0.0" },
  },
  {
    eventId: "018f0f4e-8c5b-7a91-8c3b-123456789e04",
    kind: "agent.run.completed",
    occurredAt: "2026-08-08T00:00:01.000Z",
    sequence: 1,
    identity: { runId: RUN_ID },
    facts: { status: "completed" },
  },
];

export const scriptedTransport = (
  result: JsonValue = {
    identity: { runId: RUN_ID },
    status: "completed",
    output: { kind: "text", text: '{"echo":"a"}' },
  },
  nativeResult: JsonValue = nativeEnvelope(),
  events: JsonValue[] = lifecycleEvents(),
): PydanticAiBridgeTransport => ({
  async exchange(request) {
    if (request.operation === "native-typed-output") {
      return {
        protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
        operation: request.operation,
        ok: false,
        error: {
          code: "native-typed-output-unsupported",
          message: "PydanticAI output_type is not supported by this bridge.",
        },
      };
    }
    if (request.operation === "native-events") {
      return {
        protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
        operation: request.operation,
        ok: false,
        error: {
          code: "native-event-stream-unsupported",
          message: "PydanticAI native event streaming is not supported by this bridge.",
        },
      };
    }
    const payloadByOperation: Partial<Record<typeof request.operation, JsonValue>> = {
      handshake: handshake() as unknown as JsonValue,
      prepare: { token: "prepared-token" },
      start: { runId: RUN_ID },
      result,
      "native-result": nativeResult,
      events,
    };
    return {
      protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
      operation: request.operation,
      ok: true,
      payload: payloadByOperation[request.operation] ?? {},
    };
  },
});

export const startScriptedRun = async (
  transport: PydanticAiBridgeTransport = scriptedTransport(),
) => {
  const runner = createPydanticAiBridgeRunner(transport);
  const agent = await runner.prepare(baseDefinition);
  const run = await runner.start({
    agent,
    invocationContext: {
      invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789e01"),
    },
    input: { prompt: "hello" },
  });
  return { runner, run };
};
