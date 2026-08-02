import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
/* eslint-disable max-lines -- one adapter conformance narrative shares authority-mutating fixtures */
import { contractVersion, digest, extensionNamespace, type JsonValue } from "#contracts";
import {
  compilePydanticAiAgentSpec,
  preparePydanticAiAgentSpec,
  PYDANTIC_AI_AGENT_SPEC_SUPPORT,
  PydanticAiUnsupportedSemanticsError,
  type PydanticAiCompilationTarget,
} from "../../../src/adapters/pydantic-ai-spec";
import {
  createSpecificationDecision,
  createSpecificationDecisionRecord,
  createSpecificationSourceSnapshot,
  loadSpecification,
  projectSpecification,
  reviewSpecification,
  type SpecificationPolicy,
  type SpecificationPolicyCurrentState,
} from "../../../src/specifications";

const version = contractVersion("1.0.0");
const sourceDigest = digest("1".repeat(64));
const resolvedDigest = digest("2".repeat(64));
const evidenceDigest = digest("3".repeat(64));
const exactPython = process.env.LLM_CORE_PYDANTIC_AI_PYTHON;
type SemanticCategory = "modelRequirements" | "prompt" | "tools" | "context" | "evaluation";

const emptySemanticContent = {
  modelRequirements: [],
  prompt: null,
  tools: [],
  context: null,
  evaluation: null,
} as const satisfies JsonValue;

const fixtureBytes = (name: string): Buffer =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const target = (
  effectRequirement: "read-only" | "controlled" = "read-only",
  scopeIds = ["requirement.pydantic" as never],
): PydanticAiCompilationTarget => ({
  agent: {
    agentId: "agent.pydantic",
    version,
    instructions: "Follow the accepted specification.",
    effectRequirement,
  },
  semantics: {
    reviewedScope: {
      modelRequirements: scopeIds,
      prompt: scopeIds,
      tools: scopeIds,
      context: scopeIds,
      evaluation: scopeIds,
    },
    modelRequirements: [],
    prompt: null,
    tools: [],
    context: null,
    evaluation: null,
  },
  model: "openai:gpt-5.2",
});

const rejected = (operation: () => unknown) => expect(Promise.resolve().then(operation)).rejects;

const fixture = async (
  contents: readonly Readonly<Record<string, JsonValue>>[] = [],
  bindSemanticContent = true,
) => {
  const source = createSpecificationSourceSnapshot({
    sourceId: "source.pydantic" as never,
    format: { id: extensionNamespace("org.example.specification"), version },
    revision: "revision.1",
    contentDigest: sourceDigest,
    observedAt: "2026-08-01T00:00:00.000Z",
    role: "primary",
    authority: "authoritative",
    documents: [{ documentId: "root", content: { title: "PydanticAI adapter" } }],
  });
  let revision = source.revision;
  let policyVersion = version;
  let authority = "authority.pydantic";
  let currentDigest = resolvedDigest;
  let currentScope: SpecificationPolicyCurrentState["acceptedScope"] | undefined;
  let now = "2026-08-02T00:00:00.000Z";
  const policy: SpecificationPolicy = {
    decide: ({ review }) =>
      createSpecificationDecision({
        status: "accepted",
        record: createSpecificationDecisionRecord({
          recordId: "decision.pydantic" as never,
          resolvedDigest,
          acceptedScope: review.items.map((item) => item.scopeId),
          decision: { kind: "human", summary: "Approved." },
          evidence: [{ evidenceId: "evidence.pydantic", digest: evidenceDigest }],
          authority: "authority.pydantic",
          policyVersions: [{ policyId: "policy.pydantic", version }],
          sources: [
            {
              sourceId: source.sourceId,
              revision: source.revision,
              contentDigest: source.contentDigest,
            },
          ],
          validity: {
            expiresAt: "2026-08-03T00:00:00.000Z",
            invalidatedBy: ["source-revision", "policy-version"],
          },
        }),
      }),
    current: ({ record }) => ({
      authority,
      resolvedDigest: currentDigest,
      acceptedScope: currentScope ?? record.acceptedScope,
      policyVersions: record.policyVersions.map((binding) => ({
        ...binding,
        version: policyVersion,
      })),
      sources: record.sources.map((binding) => ({ ...binding, revision })),
    }),
    now: () => now,
  };
  const suppliedContents = contents.length === 0 ? [{}] : contents;
  const itemContents = bindSemanticContent
    ? suppliedContents.map((content) => ({ ...emptySemanticContent, ...content }))
    : suppliedContents;
  const scopeIds = itemContents.map(
    (_, index) =>
      (index === 0 ? "requirement.pydantic" : `requirement.pydantic.${index + 1}`) as never,
  );
  const specification = loadSpecification({
    graphId: "graph.pydantic",
    version,
    sources: [source],
    nodes: itemContents.map((content, index) => ({
      nodeId: scopeIds[index]!,
      kind: "requirement",
      title: `Compile an approved agent ${index + 1}.`,
      source: { sourceId: source.sourceId, documentId: "root" },
      ...(content === undefined ? {} : { content }),
    })),
    relationships: [],
  });
  const decision = await reviewSpecification(specification, { policy });
  if (decision.status !== "accepted") throw new TypeError("Expected an accepted decision.");
  return {
    decision,
    scopeIds,
    advancePolicy: () => {
      policyVersion = contractVersion("1.0.1");
    },
    advanceAuthority: () => {
      authority = "authority.pydantic.replaced";
    },
    advanceSource: () => {
      revision = "revision.2";
    },
    advanceDigest: () => {
      currentDigest = digest("4".repeat(64));
    },
    advanceScope: () => {
      currentScope = [];
    },
    expire: () => {
      now = "2026-08-03T00:00:00.000Z";
    },
  };
};

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
        report: { issues: expect.arrayContaining([expect.objectContaining({ code })]) },
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
        report: {
          fidelity: "rejected",
          issues: expect.arrayContaining([
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
        report: {
          issues: expect.arrayContaining([
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
        report: {
          fidelity: "rejected",
          issues: [
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

  test("degrades explicitly for advisory model requirements that AgentSpec omits", async () => {
    const advisory = [{ capabilityId: "llm-core.model.streaming", required: false }];
    const value = await fixture([{ modelRequirements: advisory }]);
    const compilation = await compilePydanticAiAgentSpec({
      decision: value.decision,
      target: {
        ...target(),
        semantics: {
          ...target().semantics,
          modelRequirements: advisory,
        },
      },
    });
    expect(compilation.report).toMatchObject({
      fidelity: "partial",
      issues: [
        expect.objectContaining({
          code: "pydantic-ai.advisory-model-requirements-omitted",
          disposition: "degraded",
        }),
      ],
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
    expect(compilation).not.toBeInstanceOf(Promise);
    if (compilation instanceof Promise) throw new TypeError("Expected synchronous compilation.");

    const prepared = preparePydanticAiAgentSpec({
      compiled: compilation.compiled,
      native: {
        prepare: () => ({ token: "native" }),
        execute: ({ input }: { readonly input: string }) => `executed:${input}`,
        resume: ({ input }: { readonly input: string }) => `resumed:${input}`,
      },
    });
    expect(prepared).not.toBeInstanceOf(Promise);
    if (prepared instanceof Promise) throw new TypeError("Expected synchronous preparation.");
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
    expect(PYDANTIC_AI_AGENT_SPEC_SUPPORT.fixtures[0]?.digest.value).toBe(
      hash(fixtureBytes("safe-agent-spec-v2.19.0.json")),
    );
    expect(PYDANTIC_AI_AGENT_SPEC_SUPPORT.evidence[0]?.digest.value).toBe(
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
      direction: "export",
      levels: ["compilation"],
      supportedVersions: ["2.19.0"],
      sourceOwnership: "source-owned",
      writeBack: "unsupported",
    });
    expect(PYDANTIC_AI_AGENT_SPEC_SUPPORT.features).toEqual(
      expect.arrayContaining(["agent-name", "model-id", "literal-instructions"]),
    );
    expect(PYDANTIC_AI_AGENT_SPEC_SUPPORT.features).not.toEqual(
      expect.arrayContaining([
        "literal-description",
        "metadata",
        "model-settings",
        "model-requirements",
        "prompt-templates",
        "tools",
        "context",
        "evaluation",
      ]),
    );
  });
});
