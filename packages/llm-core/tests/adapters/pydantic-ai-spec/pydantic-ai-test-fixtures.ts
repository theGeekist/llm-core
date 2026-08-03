import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect } from "bun:test";
import { contractVersion, digest, extensionNamespace, type JsonValue } from "#contracts";
import type { PydanticAiCompilationTarget } from "../../../src/adapters/pydantic-ai-spec/public";
import {
  createSpecificationDecision,
  createSpecificationDecisionRecord,
  createSpecificationSourceSnapshot,
  loadSpecification,
  reviewSpecification,
  type SpecificationPolicy,
  type SpecificationPolicyCurrentState,
} from "../../../src/specifications";

export const version = contractVersion("1.0.0");
export const sourceDigest = digest("1".repeat(64));
export const resolvedDigest = digest("2".repeat(64));
export const evidenceDigest = digest("3".repeat(64));
export const exactPython = process.env.LLM_CORE_PYDANTIC_AI_PYTHON;
export type SemanticCategory = "modelRequirements" | "prompt" | "tools" | "context" | "evaluation";

export const emptySemanticContent = {
  modelRequirements: [],
  prompt: null,
  tools: [],
  context: null,
  evaluation: null,
} as const satisfies JsonValue;

export const fixtureBytes = (name: string): Buffer =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

export const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export const target = (
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

export const rejected = (operation: () => unknown) =>
  expect(Promise.resolve().then(operation)).rejects;

export const fixture = async (
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
