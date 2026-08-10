import { describe, expect, test } from "bun:test";
import type { JsonValue } from "#contracts";
import {
  compilePydanticAiAgentSpec,
  type PydanticAiCompilationTarget,
} from "../../../src/adapters/pydantic-ai-spec/public";
import {
  fixture,
  rejected,
  type SemanticCategory,
  sourceDigest,
  target,
} from "./pydantic-ai-test-fixtures";

describe("PydanticAI AgentSpec adapter", () => {
  test("derives every semantic category from authority-bound accepted content", async () => {
    const cases: readonly [SemanticCategory, JsonValue, string][] = [
      [
        "modelRequirements",
        [{ capabilityId: "llm-core.model.streaming", required: true }],
        "pydantic-ai.model-requirements-unsupported",
      ],
      [
        "prompt",
        {
          name: "prompt.reviewed",
          template: "Answer {{question}}",
          inputs: [{ name: "question", type: "string", required: true }],
        },
        "pydantic-ai.prompt-template-unsupported",
      ],
      [
        "tools",
        [{ name: "lookup", parameters: { type: "object" } }],
        "pydantic-ai.tool-declarations-unsupported",
      ],
      ["context", { identity: sourceDigest }, "pydantic-ai.context-selection-unsupported"],
      [
        "evaluation",
        { thresholdStatus: "qualified" },
        "pydantic-ai.evaluation-qualification-unsupported",
      ],
    ];
    for (const [category, acceptedValue, code] of cases) {
      const value = await fixture([{ [category]: acceptedValue }]);
      const reviewed = target().semantics;
      await expect(
        Promise.resolve().then(() =>
          compilePydanticAiAgentSpec({
            decision: value.decision,
            target: {
              ...target(),
              semantics: { ...reviewed, [category]: acceptedValue },
            } as PydanticAiCompilationTarget,
          }),
        ),
      ).rejects.toMatchObject({
        operation: { diagnostics: expect.arrayContaining([expect.objectContaining({ code })]) },
      });
    }
  });

  test("rejects empty and null review claims that contradict accepted category content", async () => {
    const cases: readonly [SemanticCategory, JsonValue][] = [
      ["modelRequirements", [{ capabilityId: "llm-core.model.streaming", required: true }]],
      [
        "prompt",
        {
          name: "prompt.reviewed",
          template: "Answer {{question}}",
          inputs: [{ name: "question", type: "string", required: true }],
        },
      ],
      ["tools", [{ name: "lookup", parameters: { type: "object" } }]],
      ["context", { identity: sourceDigest }],
      ["evaluation", { thresholdStatus: "qualified" }],
    ];
    for (const [category, acceptedValue] of cases) {
      const value = await fixture([{ [category]: acceptedValue }]);
      await expect(
        Promise.resolve().then(() =>
          compilePydanticAiAgentSpec({ decision: value.decision, target: target() }),
        ),
      ).rejects.toMatchObject({
        operation: {
          disposition: "unsupported",
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              code: `pydantic-ai.${
                category === "modelRequirements" ? "model-requirements" : category
              }-review-content-mismatch`,
              nodeId: "requirement.pydantic",
            }),
          ]),
        },
      });
    }
  });

  test("rejects contradictory repeated accepted category content deterministically", async () => {
    const cases: readonly [SemanticCategory, JsonValue, JsonValue][] = [
      ["modelRequirements", [], [{ capabilityId: "llm-core.model.streaming", required: true }]],
      [
        "prompt",
        null,
        {
          name: "prompt.reviewed",
          template: "Answer {{question}}",
          inputs: [{ name: "question", type: "string", required: true }],
        },
      ],
      ["tools", [], [{ name: "lookup" }]],
      ["context", null, { identity: sourceDigest }],
      ["evaluation", null, { thresholdStatus: "qualified" }],
    ];
    for (const [category, emptyValue, acceptedValue] of cases) {
      const value = await fixture([{ [category]: emptyValue }, { [category]: acceptedValue }]);
      await expect(
        Promise.resolve().then(() =>
          compilePydanticAiAgentSpec({
            decision: value.decision,
            target: target("read-only", value.scopeIds),
          }),
        ),
      ).rejects.toMatchObject({
        operation: {
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              code: `pydantic-ai.${
                category === "modelRequirements" ? "model-requirements" : category
              }-accepted-content-contradictory`,
              nodeId: "requirement.pydantic.2",
            }),
          ]),
        },
      });
    }
  });

  test("rejects false exact claims when any semantic category does not cover accepted scope", async () => {
    const value = await fixture();
    for (const category of [
      "modelRequirements",
      "prompt",
      "tools",
      "context",
      "evaluation",
    ] as const) {
      const reviewed = target().semantics;
      const compilationTarget = {
        ...target(),
        semantics: {
          ...reviewed,
          reviewedScope: { ...reviewed.reviewedScope, [category]: [] },
        },
      };
      await expect(
        Promise.resolve().then(() =>
          compilePydanticAiAgentSpec({ decision: value.decision, target: compilationTarget }),
        ),
      ).rejects.toMatchObject({
        operation: {
          disposition: "unsupported",
          diagnostics: [
            expect.objectContaining({
              code: `pydantic-ai.${
                category === "modelRequirements" ? "model-requirements" : category
              }-review-scope-invalid`,
            }),
          ],
        },
      });
    }
  });

  test("rejects advisory model requirements because they are still requested semantics", async () => {
    const advisory = [{ capabilityId: "llm-core.model.streaming", required: false }];
    const value = await fixture([{ modelRequirements: advisory }]);
    await expect(
      Promise.resolve().then(() =>
        compilePydanticAiAgentSpec({
          decision: value.decision,
          target: {
            ...target(),
            semantics: {
              ...target().semantics,
              modelRequirements: advisory,
            },
          },
        }),
      ),
    ).rejects.toMatchObject({
      operation: {
        disposition: "unsupported",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "pydantic-ai.model-requirements-unsupported",
            impact: "blocking",
          }),
        ]),
      },
    });
  });

  test("requires explicit nonnegative integer tool and output retry budgets", async () => {
    const valid = await fixture();
    const compiled = await compilePydanticAiAgentSpec({
      decision: valid.decision,
      target: { ...target(), retries: { tools: 0, output: 2 } },
    });
    expect(compiled.compiled.value.retries).toEqual({ tools: 0, output: 2 });

    for (const retries of [
      2,
      { tools: 1 },
      { tools: 1, output: 2, extra: 3 },
      { tools: -1, output: 0 },
      { tools: 1.5, output: 0 },
    ]) {
      await rejected(() =>
        compilePydanticAiAgentSpec({
          decision: valid.decision,
          target: { ...target(), retries } as unknown as PydanticAiCompilationTarget,
        }),
      ).toThrow("exactly { tools, output }");
    }
  });
});
