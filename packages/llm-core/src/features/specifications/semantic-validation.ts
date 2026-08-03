import { isJsonValue } from "#contracts";
import type {
  SpecificationNode,
  SpecificationNodeId,
  SpecificationSemanticNode,
  SpecificationSemanticNodeKind,
} from "./types";
import {
  fail,
  nonBlankId,
  nonBlankText,
  optionalExtensions,
  record,
  unique,
  valueOf,
  values,
} from "./validation-support";

export const semanticNodeKinds: readonly SpecificationSemanticNodeKind[] = [
  "application",
  "agent",
  "tool",
  "context",
  "workflow-intent",
  "evaluation",
  "approval",
  "capability",
];

const documentNodeKinds = [
  "requirement",
  "decision",
  "question",
  "plan",
  "workflow",
  "artifact",
  "other",
] as const;

const nodeIds = (value: unknown, label: string): readonly SpecificationNodeId[] => {
  const ids = values(value, `dense ${label} arrays`).map((item) =>
    nonBlankId(item, `stable ${label} node identities`),
  );
  unique(ids, `unique ${label} node identities`);
  return ids as SpecificationNodeId[];
};

const optionalJson = (input: Record<string, unknown>, key: string): void => {
  const value = valueOf(input, key);
  if (value !== undefined && !isJsonValue(value)) fail(`portable JSON ${key}`);
};

// eslint-disable-next-line sonarjs/cognitive-complexity -- closed discriminated semantic variants are validated fail-closed together
export function assertSemanticNodeContent(
  kind: SpecificationSemanticNodeKind,
  value: unknown,
): void {
  if (kind === "application") {
    const input = record(value, ["capabilities", "entrypoints"], [], "closed application intent");
    nodeIds(valueOf(input, "capabilities"), "application capability");
    nodeIds(valueOf(input, "entrypoints"), "application entrypoint");
    return;
  }
  if (kind === "agent") {
    const input = record(
      value,
      ["role", "capabilities", "tools", "contexts"],
      [],
      "closed agent intent",
    );
    nonBlankText(valueOf(input, "role"), "non-blank agent roles");
    nodeIds(valueOf(input, "capabilities"), "agent capability");
    nodeIds(valueOf(input, "tools"), "agent tool");
    nodeIds(valueOf(input, "contexts"), "agent context");
    return;
  }
  if (kind === "tool") {
    const input = record(
      value,
      ["capability", "effect"],
      ["inputSchema", "outputSchema"],
      "closed tool intent",
    );
    nonBlankId(valueOf(input, "capability"), "stable tool capability identities");
    if (!["none", "read", "write", "external"].includes(String(valueOf(input, "effect")))) {
      fail("known tool effect intents");
    }
    optionalJson(input, "inputSchema");
    optionalJson(input, "outputSchema");
    return;
  }
  if (kind === "context") {
    const input = record(value, ["lifetime"], ["schema"], "closed context intent");
    if (!["request", "session", "persistent"].includes(String(valueOf(input, "lifetime")))) {
      fail("known context lifetime intents");
    }
    optionalJson(input, "schema");
    return;
  }
  if (kind === "workflow-intent") {
    const input = record(value, ["steps"], [], "closed workflow intent");
    const steps = values(valueOf(input, "steps"), "dense workflow step arrays");
    if (steps.length === 0) fail("at least one workflow step intent");
    const stepIds = steps.map((step) => {
      const item = record(
        step,
        ["stepId", "invokes", "dependsOn"],
        [],
        "closed workflow step intent",
      );
      const stepId = nonBlankId(valueOf(item, "stepId"), "stable workflow step identities");
      nonBlankId(valueOf(item, "invokes"), "stable workflow invocation identities");
      nodeIds(valueOf(item, "dependsOn"), "workflow step dependency");
      return stepId;
    });
    unique(stepIds, "unique workflow step identities");
    const knownSteps = new Set(stepIds);
    steps.forEach((step) => {
      const item = step as { readonly stepId: string; readonly dependsOn: readonly string[] };
      if (
        item.dependsOn.includes(item.stepId) ||
        item.dependsOn.some((id) => !knownSteps.has(id))
      ) {
        fail("workflow step dependencies that reference other declared steps");
      }
    });
    return;
  }
  if (kind === "evaluation") {
    const input = record(value, ["subject", "criteria"], [], "closed evaluation intent");
    nonBlankId(valueOf(input, "subject"), "stable evaluation subject identities");
    const criteria = values(valueOf(input, "criteria"), "dense evaluation criterion arrays");
    if (criteria.length === 0) fail("at least one evaluation criterion intent");
    const ids = criteria.map((criterion) => {
      const item = record(
        criterion,
        ["criterionId", "description"],
        [],
        "closed evaluation criterion intent",
      );
      const id = nonBlankId(valueOf(item, "criterionId"), "stable evaluation criterion identities");
      nonBlankText(valueOf(item, "description"), "non-blank evaluation criteria");
      return id;
    });
    unique(ids, "unique evaluation criterion identities");
    return;
  }
  if (kind === "approval") {
    const input = record(value, ["subject", "authority", "timing"], [], "closed approval intent");
    nonBlankId(valueOf(input, "subject"), "stable approval subject identities");
    nonBlankId(valueOf(input, "authority"), "stable approval authority identities");
    if (!["before", "after"].includes(String(valueOf(input, "timing")))) {
      fail("known approval timing intents");
    }
    return;
  }
  const input = record(
    value,
    ["capabilityId", "mode"],
    ["constraints"],
    "closed capability intent",
  );
  nonBlankId(valueOf(input, "capabilityId"), "stable capability intent identities");
  if (!["required", "optional"].includes(String(valueOf(input, "mode")))) {
    fail("known capability modes");
  }
  optionalJson(input, "constraints");
}

export function assertSpecificationNode(value: unknown): asserts value is SpecificationNode {
  const shape = record(
    value,
    ["nodeId", "kind", "title", "source"],
    ["content", "extensions"],
    "closed specification nodes",
  );
  const kind = String(valueOf(shape, "kind"));
  const semantic = semanticNodeKinds.includes(kind as SpecificationSemanticNodeKind);
  const input = record(
    value,
    semantic
      ? ["nodeId", "kind", "title", "source", "content"]
      : ["nodeId", "kind", "title", "source"],
    semantic ? ["extensions"] : ["content", "extensions"],
    "closed specification nodes",
  );
  nonBlankId(valueOf(input, "nodeId"), "stable node identities");
  if (!semantic && !documentNodeKinds.includes(kind as never))
    fail("known specification node kinds");
  nonBlankText(valueOf(input, "title"), "non-blank specification node titles");
  const source = record(
    valueOf(input, "source"),
    ["sourceId", "documentId"],
    ["location"],
    "a closed source binding",
  );
  nonBlankId(valueOf(source, "sourceId"), "stable source identities");
  nonBlankId(valueOf(source, "documentId"), "stable document identities");
  const location = valueOf(source, "location");
  if (location !== undefined) nonBlankText(location, "non-blank source locations");
  const content = valueOf(input, "content");
  if (semantic) assertSemanticNodeContent(kind as SpecificationSemanticNodeKind, content);
  else if (content !== undefined && !isJsonValue(content)) fail("strict JSON node content");
  optionalExtensions(input);
}

/* eslint-disable max-params -- reference set, graph index, allowed kinds and diagnostic label are irreducible validation inputs */
const expectKinds = (
  references: readonly SpecificationNodeId[],
  nodes: ReadonlyMap<SpecificationNodeId, SpecificationNode>,
  kinds: readonly SpecificationNode["kind"][],
  label: string,
): void => {
  references.forEach((reference) => {
    const target = nodes.get(reference);
    if (target === undefined || !kinds.includes(target.kind)) {
      fail(`${label} references to declared ${kinds.join(" or ")} nodes`);
    }
  });
};
/* eslint-enable max-params */

export const assertSemanticNodeReferences = (
  node: SpecificationSemanticNode,
  nodes: ReadonlyMap<SpecificationNodeId, SpecificationNode>,
): void => {
  switch (node.kind) {
    case "application":
      expectKinds(node.content.capabilities, nodes, ["capability"], "application capability");
      expectKinds(
        node.content.entrypoints,
        nodes,
        ["agent", "workflow-intent", "tool"],
        "application entrypoint",
      );
      return;
    case "agent":
      expectKinds(node.content.capabilities, nodes, ["capability"], "agent capability");
      expectKinds(node.content.tools, nodes, ["tool"], "agent tool");
      expectKinds(node.content.contexts, nodes, ["context"], "agent context");
      return;
    case "tool":
      expectKinds([node.content.capability], nodes, ["capability"], "tool capability");
      return;
    case "workflow-intent":
      expectKinds(
        node.content.steps.map((step) => step.invokes),
        nodes,
        ["agent", "tool", "capability", "workflow-intent"],
        "workflow invocation",
      );
      return;
    case "evaluation":
    case "approval":
      if (!nodes.has(node.content.subject))
        fail(`${node.kind} subjects that reference declared nodes`);
      return;
    case "context":
    case "capability":
      return;
  }
};
