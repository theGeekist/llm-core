import { describe, expect, test } from "bun:test";
import { isPromiseLike } from "#shared/maybe";
import {
  compilePydanticAiAgentSpec,
  preparePydanticAiAgentSpec,
  PYDANTIC_AI_AGENT_SPEC_SUPPORT,
} from "../../../src/adapters/pydantic-ai-spec/public";
import {
  exactPython,
  fixture,
  fixtureBytes,
  hash,
  rejected,
  target,
} from "./pydantic-ai-test-fixtures";

describe("PydanticAI AgentSpec adapter", () => {
  test("revalidates after pending native preparation before returning a wrapper", async () => {
    const value = await fixture();
    const compilation = await compilePydanticAiAgentSpec({
      decision: value.decision,
      target: target(),
    });
    let prepared = 0;
    let release!: (value: { readonly token: string }) => void;
    const pending = preparePydanticAiAgentSpec({
      compiled: compilation.compiled,
      native: {
        prepare: () => {
          prepared += 1;
          return new Promise((resolve) => {
            release = resolve;
          });
        },
        execute: () => "executed",
        resume: () => "resumed",
      },
    });
    expect(prepared).toBe(1);
    value.advanceSource();
    release({ token: "native" });
    await expect(pending).rejects.toThrow("no longer matches");
  });

  test("revalidates retained compilation authority before execute and resume", async () => {
    const value = await fixture();
    const compilation = await compilePydanticAiAgentSpec({
      decision: value.decision,
      target: target(),
    });
    let executions = 0;
    let resumes = 0;
    const prepared = await preparePydanticAiAgentSpec({
      compiled: compilation.compiled,
      native: {
        prepare: () => ({ token: "native" }),
        execute: ({ input }) => {
          executions += 1;
          return `executed:${input}`;
        },
        resume: ({ input }) => {
          resumes += 1;
          return `resumed:${input}`;
        },
      },
    });
    expect(await prepared.execute("first")).toBe("executed:first");
    expect(await prepared.resume("checkpoint.1")).toBe("resumed:checkpoint.1");
    value.advancePolicy();
    await rejected(() => prepared.execute("blocked")).toThrow("no longer matches");
    await rejected(() => prepared.resume("checkpoint.2")).toThrow("no longer matches");
    expect(executions).toBe(1);
    expect(resumes).toBe(1);
  });

  test("preserves synchronous MaybePromise behavior and returns only the safe facade", async () => {
    const value = await fixture();
    const compilation = compilePydanticAiAgentSpec({
      decision: value.decision,
      target: target(),
    });
    expect(isPromiseLike(compilation)).toBe(false);
    if (isPromiseLike(compilation)) throw new TypeError("Expected synchronous compilation.");

    const prepared = preparePydanticAiAgentSpec({
      compiled: compilation.compiled,
      native: {
        prepare: () => ({ token: "native" }),
        execute: ({ input }: { readonly input: string }) => `executed:${input}`,
        resume: ({ input }: { readonly input: string }) => `resumed:${input}`,
      },
    });
    expect(isPromiseLike(prepared)).toBe(false);
    if (isPromiseLike(prepared)) throw new TypeError("Expected synchronous preparation.");
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.keys(prepared).sort()).toEqual(["execute", "resume"]);
    expect(prepared.execute("first")).toBe("executed:first");
    expect(prepared.resume("checkpoint.1")).toBe("resumed:checkpoint.1");
  });

  test("rejects raw and foreign compiled extraction before native preparation", async () => {
    const value = await fixture();
    const compilation = await compilePydanticAiAgentSpec({
      decision: value.decision,
      target: target(),
    });
    let preparations = 0;
    const native = {
      prepare: () => {
        preparations += 1;
        return { token: "native" };
      },
      execute: () => "executed",
      resume: () => "resumed",
    };
    const foreign = Object.freeze({
      compilationId: compilation.compiled.compilationId,
      value: compilation.compiled.value,
    });

    for (const extracted of [compilation.compiled.value, foreign]) {
      await rejected(() =>
        preparePydanticAiAgentSpec({
          compiled: extracted as unknown as typeof compilation.compiled,
          native,
        }),
      ).toThrow("registered compiled specification");
    }
    expect(preparations).toBe(0);
  });

  test("binds support evidence to immutable fixture and validator bytes", () => {
    const compilation = PYDANTIC_AI_AGENT_SPEC_SUPPORT.operations.find(
      (operation) => operation.operation === "compile-portable-specification",
    );
    if (compilation?.disposition !== "supported")
      throw new TypeError("Expected compilation support.");
    expect(compilation.fixtures[0]?.digest.value).toBe(
      hash(fixtureBytes("safe-agent-spec-v2.19.0.json")),
    );
    expect(compilation.fixtures[1]?.digest.value).toBe(
      hash(fixtureBytes("validate_agent_spec.py")),
    );
  });

  test.skipIf(!exactPython)("validates the fixture with exact PydanticAI 2.19.0", () => {
    const validation = Bun.spawnSync([
      exactPython!,
      new URL("./fixtures/validate_agent_spec.py", import.meta.url).pathname,
      new URL("./fixtures/safe-agent-spec-v2.19.0.json", import.meta.url).pathname,
    ]);
    expect(validation.exitCode).toBe(0);
    expect(JSON.parse(validation.stdout.toString())).toMatchObject({
      model: "test",
      retries: { tools: 2, output: 1 },
      capabilities: ["IncludeToolReturnSchemas", "RaiseContentFilterError", "ReinjectSystemPrompt"],
    });
  });

  test("declares the exact declarative AgentSpec boundary", () => {
    expect(PYDANTIC_AI_AGENT_SPEC_SUPPORT).toMatchObject({
      authority: "PydanticAI AgentSpec",
      revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
      sourceOwnership: "source-owned",
    });
    expect(PYDANTIC_AI_AGENT_SPEC_SUPPORT.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "compile-portable-specification",
          disposition: "supported",
        }),
        expect.objectContaining({
          operation: "round-trip-native-source",
          disposition: "unsupported",
        }),
      ]),
    );
  });
});
