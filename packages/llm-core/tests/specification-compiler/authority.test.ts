import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  coreId,
  digest,
  extensionNamespace,
  secretRef,
  type EventId,
  type RunId,
  type StepId,
  type ToolCallId,
} from "#contracts";
import { isPromiseLike, type MaybePromise } from "#shared/maybe";
import { createAgent, type ExecutionPlan } from "../../src/agent";
import {
  createLocalAgentRunner,
  type AgentRunIdentityPort,
  type LocalAgentProgramPort,
} from "../../src/application/agent/public";
import { workflowSpecificationMatches } from "../../src/application/workflow/authority";
import type {
  ResumeInterventionWorkflowInput,
  ResumableWorkflowStep,
} from "../../src/application/workflow/runtime-public";
import { compileSpecification } from "../../src/application/specification-compiler/public";
import {
  registerAcceptedSpecification,
  verifyCompilationAuthority,
} from "../../src/application/specification-compiler/runtime";
import type {
  CompiledSpecification,
  SpecificationAuthorityDependencies,
  SpecificationAuthorityState,
} from "../../src/application/specification-compiler/types";
import {
  executeControlledTool,
  type ControlledToolExecutionPlan,
} from "../../src/application/tool-execution/public";
import { createBuiltinModel } from "../../src/features/model/public";
import {
  actionDigest,
  createExecutableTool,
  registerToolSchema,
  toolId,
  type ActionDigestPort,
  type ToolCall,
  type ToolDefinition,
} from "../../src/features/tooling/runtime";
import { createSpecificationGraph } from "../../src/features/specifications/factory";
import { createSpecificationSourceSnapshot } from "../../src/features/specifications/public";
import type {
  SpecificationDecision,
  SpecificationDecisionRecord,
  SpecificationNodeId,
  SpecificationSourceId,
} from "../../src/features/specifications/types";

const sourceId = "source.authority" as SpecificationSourceId;
const nodeId = "requirement.authority" as SpecificationNodeId;
const sourceDigest = digest("1".repeat(64));
const resolvedDigest = digest("2".repeat(64));
const evidenceDigest = digest("3".repeat(64));

const synchronous = <T>(value: MaybePromise<T>): T => {
  if (isPromiseLike(value)) throw new TypeError("Expected synchronous authority verification.");
  return value;
};

const authorityFixture = <T>(value: T) => {
  const source = createSpecificationSourceSnapshot({
    sourceId,
    format: { id: extensionNamespace("org.example.openspec"), version: contractVersion("1.0.0") },
    revision: "revision.1",
    contentDigest: sourceDigest,
    observedAt: "2026-08-01T00:00:00.000Z",
    role: "primary",
    authority: "authoritative",
    documents: [{ documentId: "root", content: { title: "Authority" } }],
  } as never);
  const graph = createSpecificationGraph({
    graphId: "graph.authority",
    version: contractVersion("1.0.0"),
    sources: [source],
    nodes: [
      {
        nodeId,
        kind: "requirement",
        title: "Authority requirement",
        source: { sourceId, documentId: "root" },
      },
    ],
    relationships: [],
  } as never);
  const decision: SpecificationDecision = {
    status: "accepted",
    record: {
      recordId: "decision.authority",
      resolvedDigest,
      acceptedScope: [nodeId],
      decision: { kind: "human", summary: "Approved." },
      evidence: [{ evidenceId: "evidence.authority", digest: evidenceDigest }],
      authority: "authority.current",
      policyVersions: [{ policyId: "policy.authority", version: contractVersion("1.0.0") }],
      sources: [{ sourceId, revision: "revision.1", contentDigest: sourceDigest }],
      validity: { expiresAt: "2026-08-02T00:00:00.000Z", invalidatedBy: ["source-revision"] },
    } as unknown as SpecificationDecisionRecord,
  };
  let current: SpecificationAuthorityState = {
    authority: decision.record.authority,
    resolvedDigest: decision.record.resolvedDigest,
    acceptedScope: decision.record.acceptedScope,
    policyVersions: decision.record.policyVersions,
    sources: decision.record.sources,
  };
  const authority: SpecificationAuthorityDependencies = {
    currentState: { current: () => current },
    clock: { now: () => "2026-08-01T12:00:00.000Z" },
  };
  const accepted = synchronous(registerAcceptedSpecification({ graph, decision, authority }));
  const compiled = synchronous(
    compileSpecification({ accepted, authority, compiler: { compile: () => value } }),
  );
  return {
    compiled,
    authority,
    invalidate: () => {
      current = { ...current, authority: "authority.changed" };
    },
  };
};

const identity = (): AgentRunIdentityPort => {
  let ordinal = 0;
  const id = () => `018f0f4e-8c5b-7a91-8c3b-${String(123456789910 + ordinal++).padStart(12, "0")}`;
  return {
    newRunId: () => coreId<RunId>(id()),
    newEventId: () => coreId<EventId>(id()),
    now: () => "2026-08-01T12:00:00.000Z",
  };
};

describe("specification execution authority", () => {
  test("rechecks a compiled Agent plan at creation and every common execution boundary", async () => {
    let generations = 0;
    const builtin = createBuiltinModel();
    const model = {
      ...builtin,
      generate: () => {
        generations += 1;
        return {
          kind: "completion" as const,
          content: [{ kind: "text" as const, text: "ok" }],
          finishReason: "stop" as const,
        };
      },
    };
    const plan: ExecutionPlan = {
      agent: {
        agentId: "agent.authority",
        version: contractVersion("1.0.0"),
        instructions: "Follow the approved plan.",
        effectRequirement: "read-only",
      },
      model: { profileId: model.profile.profileId, version: model.profile.version },
      tools: [],
    };
    const fixture = authorityFixture(plan);
    const agent = createAgent({
      model,
      specification: fixture.compiled,
      specificationAuthority: fixture.authority,
    });
    expect(await agent.run({ prompt: "first" })).toMatchObject({
      status: "completed",
      output: "ok",
    });
    expect(generations).toBe(1);

    fixture.invalidate();
    expect(() => agent.start({ prompt: "second" })).toThrow("no longer matches");
    expect(() => agent.run({ prompt: "third" })).toThrow("no longer matches");
    expect(() =>
      createAgent({
        model,
        specification: fixture.compiled,
        specificationAuthority: fixture.authority,
      }),
    ).toThrow("no longer matches");
    expect(generations).toBe(1);
  });

  test("rejects a reconstructed compiled value before runner preparation or execution", () => {
    let executions = 0;
    const fixture = authorityFixture({ target: "runner" });
    const program: LocalAgentProgramPort = {
      execute: () => {
        executions += 1;
        return { status: "completed", output: null };
      },
    };
    const runner = createLocalAgentRunner({
      identity: identity(),
      program,
      runnerId: "runner.authority",
      runnerVersion: contractVersion("1.0.0"),
      specification: {
        compiled: { ...fixture.compiled } as unknown as CompiledSpecification<{
          readonly agent: {
            readonly agentId: string;
            readonly version: ReturnType<typeof contractVersion>;
            readonly instructions: string;
            readonly effectRequirement: "read-only" | "controlled";
          };
        }>,
        authority: fixture.authority,
      },
    });

    expect(() =>
      runner.prepare({
        agentId: "agent.runner",
        version: contractVersion("1.0.0"),
        instructions: "Do not execute.",
        effectRequirement: "read-only",
      }),
    ).toThrow("registered compiled specification");
    expect(executions).toBe(0);
    expect(() =>
      synchronous(
        verifyCompilationAuthority({
          compiled: { ...fixture.compiled } as CompiledSpecification<unknown>,
          authority: fixture.authority,
        }),
      ),
    ).toThrow("registered compiled specification");
  });

  test("snapshots declarative targets and binds a runner to its compiled Agent", () => {
    const mutable = { target: { state: "accepted" } };
    const snapshot = authorityFixture(mutable);
    mutable.target.state = "mutated";
    expect(snapshot.compiled.value).toEqual({ target: { state: "accepted" } });
    expect(Object.isFrozen(snapshot.compiled.value)).toBe(true);
    expect(Object.isFrozen(snapshot.compiled.value.target)).toBe(true);

    const plan = {
      agent: {
        agentId: "agent.approved",
        version: contractVersion("1.0.0"),
        instructions: "Use the approved instructions.",
        effectRequirement: "read-only" as const,
      },
    };
    const fixture = authorityFixture(plan);
    const runner = createLocalAgentRunner({
      identity: identity(),
      program: { execute: () => ({ status: "completed", output: null }) },
      runnerId: "runner.authority",
      runnerVersion: contractVersion("1.0.0"),
      specification: { compiled: fixture.compiled, authority: fixture.authority },
    });

    expect(() =>
      runner.prepare({
        ...plan.agent,
        agentId: "agent.substituted",
      }),
    ).toThrow("does not authorize this Agent definition");
  });

  test("binds workflow runtime steps to the frozen declarative target", async () => {
    const stepId = coreId<StepId>("018f0f4e-8c5b-7a91-8c3b-123456789912");
    const fixture = authorityFixture({ steps: [{ stepId, effect: "none" as const }] });
    const step: ResumableWorkflowStep = {
      stepId,
      effect: "none",
      execute: (state) => ({ state }),
    };
    const input = {
      specification: { compiled: fixture.compiled, authority: fixture.authority },
      steps: [step],
    } as unknown as ResumeInterventionWorkflowInput;

    expect(await workflowSpecificationMatches(input)).toBe(true);
    (step as { stepId: StepId }).stepId = coreId<StepId>("018f0f4e-8c5b-7a91-8c3b-123456789913");
    expect(await workflowSpecificationMatches(input)).toBe(false);
  });

  test("rejects a valid compilation that targets a different controlled tool action", async () => {
    const keyRef = secretRef("vault:authority-test/current");
    const schema = await registerToolSchema(
      { type: "object", additionalProperties: false, properties: {} },
      { digest: () => digest("a".repeat(64)) },
    );
    const definition: ToolDefinition = {
      id: toolId("authority.write"),
      version: contractVersion("1.0.0"),
      description: "Authority target test",
      inputSchema: schema,
      effect: { class: "external-write", targets: [{ kind: "service", id: "authority-test" }] },
      execution: {
        concurrency: "exclusive",
        cancellation: "cooperative",
        idempotency: "required",
        retryAfterStart: "never",
      },
    };
    const call: ToolCall = {
      toolCallId: coreId<ToolCallId>("018f0f4e-8c5b-7a91-8c3b-123456789914"),
      toolId: definition.id,
      toolVersion: definition.version,
      arguments: {},
      idempotencyKey: "authority-test",
      invocation: {
        invocationId: coreId("018f0f4e-8c5b-7a91-8c3b-123456789915"),
        runId: coreId<RunId>("018f0f4e-8c5b-7a91-8c3b-123456789916"),
      },
    };
    const digestPort: ActionDigestPort = {
      create: () => actionDigest("a".repeat(43), keyRef),
      verify: () => true,
    };
    const fixture = authorityFixture({ target: "another-approved-action" });

    await expect(
      executeControlledTool({
        tool: createExecutableTool({
          definition,
          argumentValidator: { validate: () => ({ valid: true }) },
          execute: () => ({ toolCallId: call.toolCallId, status: "succeeded", content: [] }),
        }),
        call,
        securityDomain: "authority-test",
        digestKeyRef: keyRef,
        digestPort,
        journal: {} as never,
        concurrency: {} as never,
        facts: {} as never,
        specification: {
          compiled:
            fixture.compiled as unknown as CompiledSpecification<ControlledToolExecutionPlan>,
          authority: fixture.authority,
        },
      }),
    ).rejects.toThrow("does not authorize this controlled tool action");
  });
});
