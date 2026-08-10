import { describe, expect, test } from "bun:test";
import {
  assertPydanticAiBridgeCompatible,
  createNdjsonStdioTransport,
  createPydanticAiBridgeRunner,
  isPydanticAiNativeRunObservation,
  PYDANTIC_AI_BRIDGE_PROTOCOL,
  PYDANTIC_AI_OPERATION_MATRIX,
  PYDANTIC_AI_OPERATIONS,
  type PydanticAiBridgeTransport,
} from "../../src/adapters/runtimes/public";
import {
  externalId,
  newCoreId,
  type InvocationId,
  type JsonValue,
  type ProviderSessionId,
} from "#contracts";
import { collectEvents, prepare, runRequest } from "./runner-fixtures";
import {
  RUN_ID,
  baseDefinition,
  handshake,
  lifecycleEvents,
  nativeEnvelope,
  nativeObservation,
  scriptedTransport,
  startScriptedRun,
} from "./pydantic-ai-bridge-fixtures";

const exactPython = process.env.LLM_CORE_PYDANTIC_AI_PYTHON;

const exactUnsupportedOperation = async (
  operation: "native-typed-output" | "native-events",
  extra: Record<string, JsonValue> = {},
) => {
  if (!exactPython) return undefined;
  const script = new URL("../../src/adapters/runtimes/pydantic_ai_bridge.py", import.meta.url)
    .pathname;
  const transport = createNdjsonStdioTransport({ command: exactPython, args: [script] });
  try {
    const runner = createPydanticAiBridgeRunner(transport);
    const run = await runner.start(runRequest(await prepare(runner)));
    return await transport.exchange({
      protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
      operation,
      payload: { runId: run.identity.runId, ...extra },
    });
  } finally {
    await transport.close();
  }
};

describe("PydanticAI exact operation matrix", () => {
  test("portable-operation-matrix: pins every operation to authority and fixtures", () => {
    expect(PYDANTIC_AI_OPERATION_MATRIX).toMatchObject({
      assessedRelease: "2.19.0",
      assessedCommit: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
      supportedReleaseRange: "==2.19.0",
      conformanceEvidence: "local-executable-operation-fixtures",
    });
    expect(PYDANTIC_AI_OPERATION_MATRIX.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "portable.agent.observe.normalized-lifecycle",
          surface: "portable",
          disposition: "supported",
          owner: "@geekist/llm-core",
        }),
        expect.objectContaining({
          operation: "native.pydantic-ai.event-stream",
          surface: "native",
          disposition: "unsupported",
          owner: "pydantic-ai",
        }),
        expect.objectContaining({
          operation: "native.pydantic-ai.testmodel.echo-four-message-history-json",
          disposition: "supported",
          owner: "pydantic-ai",
        }),
      ]),
    );
    expect(PYDANTIC_AI_OPERATION_MATRIX.operations.every(({ contract }) => contract.version)).toBe(
      true,
    );
    expect(
      PYDANTIC_AI_OPERATION_MATRIX.operations.every(
        (operation) => operation.disposition === "not-applicable" || operation.fixtures.length > 0,
      ),
    ).toBe(true);
    expect(
      PYDANTIC_AI_OPERATION_MATRIX.operations.some(
        (operation) => (operation.disposition as string) === "projected",
      ),
    ).toBe(false);
    expect(Object.isFrozen(PYDANTIC_AI_OPERATIONS)).toBe(true);
    expect(PYDANTIC_AI_OPERATIONS.every(Object.isFrozen)).toBe(true);
    expect(PYDANTIC_AI_OPERATIONS.every(({ fixtures }) => Object.isFrozen(fixtures))).toBe(true);
    expect(
      PYDANTIC_AI_OPERATIONS.some(({ operation }) =>
        [
          "native.pydantic-ai.function-tool-observation",
          "native.pydantic-ai.message-history-json",
        ].includes(operation),
      ),
    ).toBe(false);
    expect(
      PYDANTIC_AI_OPERATIONS.find(
        ({ operation }) => operation === "native.pydantic-ai.typed-output",
      )?.fixtures,
    ).toEqual([
      "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-native-typed-output-operation",
    ]);
    expect(
      PYDANTIC_AI_OPERATIONS.find(
        ({ operation }) => operation === "native.pydantic-ai.event-stream",
      )?.fixtures,
    ).toEqual([
      "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-native-event-stream-operation",
    ]);
  });

  test("accepts only the assessed v2.19.0 release and exact operation matrix", () => {
    expect(() => assertPydanticAiBridgeCompatible(handshake())).not.toThrow();
    expect(() =>
      assertPydanticAiBridgeCompatible(handshake({ pydanticAiVersion: "2.18.4" })),
    ).toThrow("not the assessed 2.19.0");
    expect(() =>
      assertPydanticAiBridgeCompatible(handshake({ pydanticAiVersion: "2.20.0" })),
    ).toThrow("not the assessed 2.19.0");
    expect(() =>
      assertPydanticAiBridgeCompatible(handshake({ pydanticAiVersion: "3.0.0" })),
    ).toThrow("not the assessed 2.19.0");
    expect(() =>
      assertPydanticAiBridgeCompatible(handshake({ pydanticAiAvailable: false })),
    ).toThrow("not installed");
    expect(() => assertPydanticAiBridgeCompatible(handshake({ operations: [] }))).toThrow(
      "operation matrix",
    );
    expect(() => assertPydanticAiBridgeCompatible(handshake({ pythonVersion: "3.15.0" }))).toThrow(
      "outside >=3.10 <3.15",
    );
  });

  test("missing PydanticAI fails closed deterministically", async () => {
    const transport: PydanticAiBridgeTransport = {
      async exchange(request) {
        return {
          protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
          operation: request.operation,
          ok: true,
          payload: handshake({ pydanticAiAvailable: false }) as unknown as never,
        };
      },
    };
    await expect(createPydanticAiBridgeRunner(transport).capabilities()).rejects.toMatchObject({
      code: "pydantic-ai-unavailable",
    });
  });

  test.skipIf(!exactPython)(
    "supported-exact-operations: exposes portable text and native observations separately",
    async () => {
      const script = new URL("../../src/adapters/runtimes/pydantic_ai_bridge.py", import.meta.url)
        .pathname;
      const transport = createNdjsonStdioTransport({ command: exactPython!, args: [script] });
      try {
        const runner = createPydanticAiBridgeRunner(transport);
        expect((await runner.capabilities()).cancellation).toBe("none");
        const run = await runner.start(runRequest(await prepare(runner)));
        const result = await run.result();
        expect(result.output).toEqual({ kind: "text", text: '{"echo":"a"}' });
        expect(result.output).not.toHaveProperty("native");
        const native = await run.nativeResult();
        expect(native.native.toolNames).toEqual(["echo"]);
        expect(isPydanticAiNativeRunObservation(native as unknown as JsonValue)).toBe(true);
        const messageHistory = native.native.messageHistory as Array<{
          parts?: Array<{ part_kind?: string; content?: unknown }>;
        }>;
        const userPrompt = messageHistory
          .flatMap((message) => message.parts ?? [])
          .find((part) => part.part_kind === "user-prompt");
        expect(userPrompt?.content).toBe("hello");
        expect((await collectEvents(run)).at(-1)?.kind).toBe("agent.run.completed");
      } finally {
        await transport.close();
      }
    },
  );

  test("supported-exact-operations: rejects open or hostile portable lifecycle events", async () => {
    const variants = lifecycleEvents();
    const openEnvelope = structuredClone(variants);
    (openEnvelope[0] as Record<string, JsonValue>).nativeEvent = { kind: "provider-native" };
    const openIdentity = structuredClone(variants);
    (openIdentity[0] as { identity: Record<string, JsonValue> }).identity.providerSession =
      "provider-session:secret";
    const openFacts = structuredClone(variants);
    (openFacts[0] as { facts: Record<string, JsonValue> }).facts.providerState = {
      secret: "must-not-cross",
    };
    const invalidTimestamp = structuredClone(variants);
    (invalidTimestamp[0] as Record<string, JsonValue>).occurredAt = "not-a-dateZ";
    const impossibleTimestamp = structuredClone(variants);
    (impossibleTimestamp[0] as Record<string, JsonValue>).occurredAt = "2026-02-30T00:00:00.000Z";

    for (const [events, code] of [
      [openEnvelope, "malformed-event"],
      [openIdentity, "event-identity-mismatch"],
      [openFacts, "malformed-event-facts"],
      [invalidTimestamp, "malformed-event"],
      [impossibleTimestamp, "malformed-event"],
    ] as const) {
      const { run } = await startScriptedRun(scriptedTransport(undefined, undefined, events));
      await expect(collectEvents(run)).rejects.toMatchObject({ code });
    }

    let reads = 0;
    const hostileEvent = {
      ...(variants[0] as Record<string, JsonValue>),
    } as Record<string, unknown>;
    Object.defineProperty(hostileEvent, "facts", {
      enumerable: true,
      get: () => {
        reads += 1;
        return { agentId: "bounded-agent", agentVersion: "2.0.0" };
      },
    });
    const { run } = await startScriptedRun(
      scriptedTransport(undefined, undefined, [hostileEvent as JsonValue]),
    );
    await expect(collectEvents(run)).rejects.toMatchObject({ code: "non-portable-payload" });
    expect(reads).toBe(0);
  });

  test("unsupported-result-operations: rejects non-text and malformed native results", async () => {
    const structuredResult = {
      identity: { runId: RUN_ID },
      status: "completed",
      output: { kind: "json", value: { answer: 42 } },
    };
    const structured = await startScriptedRun(scriptedTransport(structuredResult));
    await expect(structured.run.result()).rejects.toMatchObject({
      code: "unsupported-portable-result",
    });

    const valid = nativeObservation();
    expect(isPydanticAiNativeRunObservation(valid as unknown as JsonValue)).toBe(true);
    const history = structuredClone(valid.native.messageHistory) as JsonValue[];
    const callMessage = history[1] as { parts: JsonValue[] };
    callMessage.parts[0] = null;
    const malformedObservations: JsonValue[] = [
      { ...valid, undeclared: true } as unknown as JsonValue,
      {
        ...valid,
        native: { ...valid.native, providerState: { secret: "passes" } },
      } as unknown as JsonValue,
      {
        ...valid,
        native: { ...valid.native, output: { typed: true } },
      } as unknown as JsonValue,
      {
        ...valid,
        native: { ...valid.native, events: [{ kind: "native" }] },
      } as unknown as JsonValue,
      {
        ...valid,
        native: { ...valid.native, messageHistory: history },
      } as unknown as JsonValue,
    ];

    for (const candidate of malformedObservations) {
      expect(isPydanticAiNativeRunObservation(candidate)).toBe(false);
      const target = await startScriptedRun(
        scriptedTransport(undefined, {
          identity: { runId: RUN_ID },
          observation: candidate,
        }),
      );
      await expect(target.run.nativeResult()).rejects.toMatchObject({
        code: "malformed-native-result",
      });
    }

    const wrongRun = await startScriptedRun(
      scriptedTransport(undefined, nativeEnvelope(valid, "018f0f4e-8c5b-7a91-8c3b-123456789eff")),
    );
    await expect(wrongRun.run.nativeResult()).rejects.toMatchObject({
      code: "malformed-native-result",
    });
    const contradictory = structuredClone(valid) as unknown as {
      runtime: "pydantic-ai";
      runtimeVersion: "2.19.0";
      native: {
        output: string;
        toolNames: ["echo"];
        messageHistory: JsonValue[];
      };
    };
    contradictory.native.output = "different portable output";
    const finalMessage = contradictory.native.messageHistory[3] as {
      parts: Array<{ content: string }>;
    };
    finalMessage.parts[0]!.content = "different portable output";
    const wrongOutput = await startScriptedRun(
      scriptedTransport(undefined, nativeEnvelope(contradictory)),
    );
    await expect(wrongOutput.run.nativeResult()).rejects.toMatchObject({
      code: "native-portable-result-mismatch",
    });

    let reads = 0;
    const hostile = { ...valid } as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, "native", {
      enumerable: true,
      get: () => {
        reads += 1;
        return valid.native;
      },
    });
    expect(isPydanticAiNativeRunObservation(hostile as JsonValue)).toBe(false);
    expect(reads).toBe(0);
  });

  test("unsupported-native-typed-output-operation: rejects PydanticAI output_type", async () => {
    const response = await scriptedTransport().exchange({
      protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
      operation: "native-typed-output",
      payload: { runId: RUN_ID, output_type: "str" },
    });
    expect(response).toMatchObject({
      ok: false,
      error: { code: "native-typed-output-unsupported" },
    });
    const exact = await exactUnsupportedOperation("native-typed-output", { output_type: "str" });
    if (exact) {
      expect(exact).toMatchObject({
        ok: false,
        error: { code: "native-typed-output-unsupported" },
      });
    }
  });

  test("unsupported-native-event-stream-operation: rejects native event streaming", async () => {
    const response = await scriptedTransport().exchange({
      protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
      operation: "native-events",
      payload: { runId: RUN_ID },
    });
    expect(response).toMatchObject({
      ok: false,
      error: { code: "native-event-stream-unsupported" },
    });
    const exact = await exactUnsupportedOperation("native-events");
    if (exact) {
      expect(exact).toMatchObject({
        ok: false,
        error: { code: "native-event-stream-unsupported" },
      });
    }
  });

  test("unsupported-control-and-continuation-operations: fails closed", async () => {
    const { runner, run } = await startScriptedRun();
    expect(runner.resume).toBeUndefined();
    await expect(run.cancel({ requestedAt: "2026-07-30T00:00:01.000Z" })).rejects.toMatchObject({
      code: "cancellation-unsupported",
    });
    await expect(run.intervene({} as never)).rejects.toMatchObject({
      code: "interventions-unsupported",
    });
    await expect(
      runner.start({
        ...runRequest(await runner.prepare(baseDefinition)),
        providerSession: {
          kind: "provider-session-ref",
          providerId: "test",
          sessionId: externalId<ProviderSessionId>("session:unsupported"),
        },
      }),
    ).rejects.toMatchObject({ code: "provider-session-unsupported" });
  });

  test.skipIf(!exactPython)(
    "validates the qualified AgentSpec fixture with exact PydanticAI 2.19.0",
    () => {
      const fixtureRoot = new URL("../adapters/pydantic-ai-spec/fixtures/", import.meta.url);
      const validation = Bun.spawnSync([
        exactPython!,
        new URL("validate_agent_spec.py", fixtureRoot).pathname,
        new URL("safe-agent-spec-v2.19.0.json", fixtureRoot).pathname,
      ]);
      expect(validation.stderr.toString()).toBe("");
      expect(validation.exitCode).toBe(0);
      expect(JSON.parse(validation.stdout.toString())).toMatchObject({
        model: "test",
        retries: { tools: 2, output: 1 },
        capabilities: [
          "IncludeToolReturnSchemas",
          "RaiseContentFilterError",
          "ReinjectSystemPrompt",
        ],
      });
    },
  );

  test("rejects malformed and unknown handshake variants", async () => {
    const transport: PydanticAiBridgeTransport = {
      async exchange(request) {
        return {
          protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
          operation: request.operation,
          ok: true,
          payload: { protocol: "unknown/v9" },
        };
      },
    };
    await expect(createPydanticAiBridgeRunner(transport).capabilities()).rejects.toThrow(
      "invalid pythonVersion",
    );
  });

  test("unsupported-definition-and-input-operations: rejects every undeclared field", async () => {
    const acceptedHandshake = handshake();
    const transport: PydanticAiBridgeTransport = {
      async exchange(request) {
        if (request.operation === "handshake") {
          return {
            protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
            operation: "handshake",
            ok: true,
            payload: acceptedHandshake as unknown as never,
          };
        }
        return {
          protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
          operation: request.operation,
          ok: true,
          payload: { token: "prepared-token" },
        };
      },
    };
    const runner = createPydanticAiBridgeRunner(transport);
    let definitionReads = 0;
    const hostileDefinition = {
      agentId: baseDefinition.agentId,
      version: baseDefinition.version,
      instructions: baseDefinition.instructions,
    } as Record<string, unknown>;
    Object.defineProperty(hostileDefinition, "effectRequirement", {
      enumerable: true,
      get: () => {
        definitionReads += 1;
        return "read-only";
      },
    });
    await expect(runner.prepare(hostileDefinition as never)).rejects.toMatchObject({
      code: "non-portable-payload",
    });
    expect(definitionReads).toBe(0);

    await expect(
      runner.prepare({ ...baseDefinition, metadata: { ignored: true } }),
    ).rejects.toThrow("closed literal");
    await expect(
      runner.prepare({ ...baseDefinition, tools: [{ name: "echo" }] } as never),
    ).rejects.toThrow("closed literal");
    await expect(
      runner.prepare({ ...baseDefinition, dependencies: { providerState: true } } as never),
    ).rejects.toThrow("closed literal");
    await expect(
      runner.prepare({ ...baseDefinition, effectRequirement: "controlled" }),
    ).rejects.toThrow("controlled-effect");
    await expect(
      runner.prepare({ ...baseDefinition, instructions: "Hello {{name}}" }),
    ).rejects.toThrow("literal");
    const prepared = await runner.prepare(baseDefinition);
    let promptReads = 0;
    const hostileInput = {} as Record<string, unknown>;
    Object.defineProperty(hostileInput, "prompt", {
      enumerable: true,
      get: () => {
        promptReads += 1;
        return "hello";
      },
    });
    await expect(
      runner.start({
        agent: prepared,
        invocationContext: {
          invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789e01"),
        },
        input: hostileInput as never,
      }),
    ).rejects.toMatchObject({ code: "non-portable-payload" });
    expect(promptReads).toBe(0);

    await expect(
      runner.start({
        agent: prepared,
        invocationContext: {
          invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789e01"),
        },
        input: { prompt: "hello", media: { kind: "binary", data: "AA==" } },
      }),
    ).rejects.toThrow("only { prompt: string }");
  });
});
