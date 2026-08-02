import { describe, expect, test } from "bun:test";
import {
  assertPydanticAiBridgeCompatible,
  createNdjsonStdioTransport,
  createPydanticAiBridgeRunner,
  PYDANTIC_AI_ASSESSED_VERSION,
  PYDANTIC_AI_BRIDGE_PROTOCOL,
  PYDANTIC_AI_COMPATIBILITY_REPORT,
  PYDANTIC_AI_SEMANTICS,
  type PydanticAiBridgeHandshake,
  type PydanticAiBridgeTransport,
} from "../../src/adapters/runtimes";
import {
  contractVersion,
  externalId,
  newCoreId,
  type InvocationId,
  type ProviderSessionId,
} from "#contracts";
import { collectEvents, prepare, runRequest } from "./runner-fixtures";

const exactPython = process.env.LLM_CORE_PYDANTIC_AI_PYTHON;

const handshake = (
  overrides: Partial<PydanticAiBridgeHandshake> = {},
): PydanticAiBridgeHandshake => ({
  protocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
  pythonVersion: "3.14.6",
  pydanticAiVersion: PYDANTIC_AI_ASSESSED_VERSION,
  pydanticAiAvailable: true,
  semantics: PYDANTIC_AI_SEMANTICS,
  ...overrides,
});

describe("PydanticAI compatibility declaration", () => {
  test("pins documentary evidence separately from executable conformance", () => {
    expect(PYDANTIC_AI_COMPATIBILITY_REPORT).toMatchObject({
      assessedRelease: "2.19.0",
      assessedCommit: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
      supportedReleaseRange: "==2.19.0",
      conformanceEvidence: "local-executable-report",
    });
    expect(PYDANTIC_AI_COMPATIBILITY_REPORT.semantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          area: "control",
          semantic: "meaningful-effects-and-approval-authority",
          disposition: "unsupported",
        }),
        expect.objectContaining({
          area: "event",
          disposition: "projected",
        }),
      ]),
    );
  });

  test("accepts only the assessed v2.19.0 release and exact loss declaration", () => {
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
    expect(() => assertPydanticAiBridgeCompatible(handshake({ semantics: [] }))).toThrow(
      "semantic declaration",
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
    "executes exact PydanticAI 2.19.0 and preserves real tool/message facts",
    async () => {
      const script = new URL("../../src/adapters/runtimes/pydantic_ai_bridge.py", import.meta.url)
        .pathname;
      const transport = createNdjsonStdioTransport({ command: exactPython!, args: [script] });
      try {
        const runner = createPydanticAiBridgeRunner(transport);
        expect((await runner.capabilities()).cancellation).toBe("none");
        const run = await runner.start(runRequest(await prepare(runner)));
        const result = await run.result();
        expect(result.output).toMatchObject({
          runtime: "pydantic-ai",
          tool: { name: "echo", registered: true },
        });
        const output = result.output as Record<string, unknown>;
        const tool = output.tool as Record<string, unknown>;
        expect(typeof tool.toolCallId).toBe("string");
        expect(tool.arguments).toEqual({ value: "a" });
        expect(tool.result).toBe("a");
        expect(Array.isArray(output.messageHistory)).toBe(true);
        const messageHistory = output.messageHistory as Array<{
          parts?: Array<{ part_kind?: string; content?: unknown }>;
        }>;
        const userPrompt = messageHistory
          .flatMap((message) => message.parts ?? [])
          .find((part) => part.part_kind === "user-prompt");
        expect(userPrompt?.content).toBe("hello");
        expect((await collectEvents(run)).at(-1)?.kind).toBe("agent.run.completed");
        expect(runner.resume).toBeUndefined();
        await expect(run.cancel({ requestedAt: "2026-07-30T00:00:01.000Z" })).rejects.toMatchObject(
          { code: "cancellation-unsupported" },
        );
        await expect(run.intervene({} as never)).rejects.toMatchObject({
          code: "interventions-unsupported",
        });
        await expect(
          runner.start({
            ...runRequest(await prepare(runner)),
            providerSession: {
              kind: "provider-session-ref",
              providerId: "test",
              sessionId: externalId<ProviderSessionId>("session:unsupported"),
            },
          }),
        ).rejects.toMatchObject({ code: "provider-session-unsupported" });
      } finally {
        await transport.close();
      }
    },
  );

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

  test("declares narrow input/spec support instead of dropping semantics", async () => {
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
    const base = {
      agentId: "bounded-agent",
      version: contractVersion("2.0.0"),
      instructions: "Literal instructions.",
      effectRequirement: "read-only" as const,
    };

    await expect(runner.prepare({ ...base, metadata: { ignored: true } })).rejects.toThrow(
      "metadata",
    );
    await expect(runner.prepare({ ...base, effectRequirement: "controlled" })).rejects.toThrow(
      "controlled-effect",
    );
    await expect(runner.prepare({ ...base, instructions: "Hello {{name}}" })).rejects.toThrow(
      "literal",
    );
    const prepared = await runner.prepare(base);
    await expect(
      runner.start({
        agent: prepared,
        invocationContext: {
          invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789e01"),
        },
        input: { prompt: "hello", ignored: true },
      }),
    ).rejects.toThrow("only { prompt: string }");
  });
});
