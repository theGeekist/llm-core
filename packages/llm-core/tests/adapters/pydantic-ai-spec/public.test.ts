import { describe, expect, test } from "bun:test";
import {
  compilePydanticAiAgentSpec,
  PydanticAiUnsupportedSemanticsError,
  type PydanticAiCompilationTarget,
} from "../../../src/adapters/pydantic-ai-spec/public";
import { projectSpecification } from "../../../src/specifications";
import { fixture, rejected, target } from "./pydantic-ai-test-fixtures";

describe("PydanticAI AgentSpec adapter", () => {
  test("compiles a review-bound decision and accounts for degraded declarative semantics", async () => {
    const value = await fixture();
    const result = await compilePydanticAiAgentSpec({
      decision: value.decision,
      target: {
        ...target(),
        depsSchema: { type: "object", properties: { tenant: { type: "string" } } },
        outputSchema: { type: "object", required: ["answer"] },
      },
    });

    expect(result.compiled.value).toEqual({
      model: "openai:gpt-5.2",
      name: "agent.pydantic",
      instructions: "Follow the accepted specification.",
      deps_schema: { type: "object", properties: { tenant: { type: "string" } } },
      output_schema: { type: "object", required: ["answer"] },
    });
    expect(result.report).toMatchObject({
      fidelity: "partial",
      issues: [
        {
          code: "pydantic-ai.deps-schema-template-only",
          disposition: "degraded",
          nodeId: "requirement.pydantic",
        },
        {
          code: "pydantic-ai.output-schema-instruction-only",
          disposition: "degraded",
          nodeId: "requirement.pydantic",
        },
      ],
    });
  });

  test("rejects unsupported controlled-effect semantics", async () => {
    const value = await fixture();
    await expect(
      Promise.resolve().then(() =>
        compilePydanticAiAgentSpec({ decision: value.decision, target: target("controlled") }),
      ),
    ).rejects.toMatchObject({
      name: "PydanticAiUnsupportedSemanticsError",
      report: {
        fidelity: "rejected",
        issues: [expect.objectContaining({ code: "pydantic-ai.controlled-effects-unsupported" })],
      },
    });
  });

  test("does not compile after source, policy, scope, digest, authority, or expiry changes", async () => {
    for (const invalidate of [
      (value: Awaited<ReturnType<typeof fixture>>) => value.advanceSource(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.advancePolicy(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.advanceScope(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.advanceDigest(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.advanceAuthority(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.expire(),
    ]) {
      const value = await fixture();
      invalidate(value);
      await rejected(() =>
        compilePydanticAiAgentSpec({ decision: value.decision, target: target() }),
      ).toThrow(/no longer matches|has expired/);
    }
  });

  test("never invokes adapter projection when initial current-authority validation fails", async () => {
    for (const invalidate of [
      (value: Awaited<ReturnType<typeof fixture>>) => value.advanceSource(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.advancePolicy(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.advanceScope(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.advanceDigest(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.advanceAuthority(),
      (value: Awaited<ReturnType<typeof fixture>>) => value.expire(),
    ]) {
      const value = await fixture();
      let projectionReads = 0;
      const watchedTarget = new Proxy(target(), {
        get(subject, key, receiver) {
          projectionReads += 1;
          return Reflect.get(subject, key, receiver);
        },
      });
      invalidate(value);
      await rejected(() =>
        compilePydanticAiAgentSpec({ decision: value.decision, target: watchedTarget }),
      ).toThrow(/no longer matches|has expired/);
      expect(projectionReads).toBe(0);
    }
  });

  test("revalidates authority after an asynchronous projection resolves", async () => {
    const value = await fixture();
    let projections = 0;
    let release!: (projection: {
      readonly target: { readonly model: string };
      readonly result: string;
    }) => void;
    const pending = projectSpecification<{ readonly model: string }, string>(value.decision, {
      project: () => {
        projections += 1;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    expect(projections).toBe(1);
    value.advanceDigest();
    release({ target: { model: "test" }, result: "report" });
    await expect(pending).rejects.toThrow("no longer matches");
  });

  test("accepts only the closed safe capability subset and reports rejected semantics", async () => {
    const value = await fixture();
    const safe = await compilePydanticAiAgentSpec({
      decision: value.decision,
      target: {
        ...target(),
        capabilities: [
          "IncludeToolReturnSchemas",
          "RaiseContentFilterError",
          "ReinjectSystemPrompt",
        ],
      },
    });
    expect(safe.compiled.value.capabilities).toEqual([
      "IncludeToolReturnSchemas",
      "RaiseContentFilterError",
      "ReinjectSystemPrompt",
    ]);

    for (const [capability, code] of [
      ["WebSearch", "pydantic-ai.effectful-capability-unsupported"],
      ["FutureCapability", "pydantic-ai.unknown-capability-unsupported"],
      [
        { IncludeToolReturnSchemas: { tools: "all" } },
        "pydantic-ai.unknown-capability-unsupported",
      ],
    ] as const) {
      const rejectedTarget = {
        ...target(),
        capabilities: [capability],
      } as unknown as PydanticAiCompilationTarget;
      try {
        await compilePydanticAiAgentSpec({ decision: value.decision, target: rejectedTarget });
        throw new Error("Expected unsupported capability rejection.");
      } catch (error) {
        expect(error).toBeInstanceOf(PydanticAiUnsupportedSemanticsError);
        expect((error as PydanticAiUnsupportedSemanticsError).report.issues).toEqual(
          expect.arrayContaining([expect.objectContaining({ code, disposition: "rejected" })]),
        );
      }
    }
  });

  test("requires explicit category review", async () => {
    const value = await fixture();
    const unreviewed = {
      ...target(),
      semantics: undefined,
    } as unknown as PydanticAiCompilationTarget;
    await expect(
      Promise.resolve().then(() =>
        compilePydanticAiAgentSpec({
          decision: value.decision,
          target: unreviewed,
        }),
      ),
    ).rejects.toMatchObject({
      report: {
        issues: [expect.objectContaining({ code: "pydantic-ai.semantic-review-required" })],
      },
    });
  });

  test("rejects absence claims without explicit authority-bound category content", async () => {
    const value = await fixture([{ note: "No semantic disposition is bound." }], false);
    await expect(
      Promise.resolve().then(() =>
        compilePydanticAiAgentSpec({ decision: value.decision, target: target() }),
      ),
    ).rejects.toMatchObject({
      report: {
        fidelity: "rejected",
        issues: expect.arrayContaining(
          ["model-requirements", "prompt", "tools", "context", "evaluation"].map((category) =>
            expect.objectContaining({
              code: `pydantic-ai.${category}-accepted-content-missing`,
              nodeId: "requirement.pydantic",
            }),
          ),
        ),
      },
    });
  });
});
