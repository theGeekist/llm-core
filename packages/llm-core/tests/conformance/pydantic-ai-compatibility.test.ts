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
import { contractVersion, newCoreId, type InvocationId } from "#contracts";

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
      conformanceEvidence: "documentary-projection-only",
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
  });

  test("the real Python bridge reports missing PydanticAI and the adapter fails closed", async () => {
    const script = new URL("../../src/adapters/runtimes/pydantic_ai_bridge.py", import.meta.url)
      .pathname;
    const transport = createNdjsonStdioTransport({ command: "python3", args: [script] });
    try {
      const runner = createPydanticAiBridgeRunner(transport);
      await expect(runner.capabilities()).rejects.toEqual(
        expect.objectContaining({
          code: "pydantic-ai-unavailable",
        }),
      );
    } finally {
      await transport.close();
    }
  });

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
