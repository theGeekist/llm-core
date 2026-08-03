import { isContractVersion, isDigest, isExtensionNamespace, isJsonValue } from "#contracts";
import { hasOnlyKeys } from "#shared/portable-data";
import type {
  ConversionIssue,
  ConversionReport,
  ProposedSpecificationChange,
  SpecificationAdapterSupport,
  SpecificationDecision,
  SpecificationDecisionRecord,
  SpecificationEvidenceBinding,
  SpecificationFormat,
  SpecificationGraph,
  SpecificationNode,
  SpecificationSemanticNode,
  SpecificationRelationship,
  SpecificationSourceBinding,
  SpecificationSourceSnapshot,
} from "./types";
import { assertKnownBinding, assertReportBindings } from "./graph-bindings";
import {
  assertSemanticNodeReferences,
  assertSpecificationNode,
  semanticNodeKinds,
} from "./semantic-validation";
import {
  fail,
  nonBlankId,
  nonBlankText,
  optionalExtensions,
  record,
  timestamp,
  unique,
  valueOf,
  values,
} from "./validation-support";

function assertFormat(value: unknown): asserts value is SpecificationFormat {
  const input = record(value, ["id", "version"], [], "a closed format identity");
  if (
    !isExtensionNamespace(valueOf(input, "id")) ||
    !isContractVersion(valueOf(input, "version"))
  ) {
    fail("a reverse-DNS format ID and SemVer format version");
  }
}

function assertSourceBinding(value: unknown): asserts value is SpecificationSourceBinding {
  const input = record(value, ["sourceId", "documentId"], ["location"], "a closed source binding");
  nonBlankId(valueOf(input, "sourceId"), "stable source identities");
  nonBlankId(valueOf(input, "documentId"), "stable document identities");
  const location = valueOf<unknown>(input, "location");
  if (location !== undefined) nonBlankText(location, "non-blank source locations");
}

function assertIssue(value: unknown): asserts value is ConversionIssue {
  const input = record(
    value,
    ["code", "severity", "disposition", "explanation"],
    ["source", "nodeId"],
    "closed conversion issues",
  );
  nonBlankText(valueOf(input, "code"), "non-blank conversion issue codes");
  if (!["info", "warning", "error"].includes(String(valueOf(input, "severity")))) {
    fail("known conversion issue severities");
  }
  if (!["preserved", "degraded", "rejected"].includes(String(valueOf(input, "disposition")))) {
    fail("known conversion issue dispositions");
  }
  nonBlankText(valueOf(input, "explanation"), "non-blank conversion issue explanations");
  const source = valueOf<unknown>(input, "source");
  const nodeId = valueOf<unknown>(input, "nodeId");
  if ((source === undefined) === (nodeId === undefined)) {
    fail("each conversion issue to identify exactly one source location or node");
  }
  if (source !== undefined) assertSourceBinding(source);
  if (nodeId !== undefined) nonBlankId(nodeId, "stable conversion node identities");
}

export function assertConversionReport(value: unknown): asserts value is ConversionReport {
  const input = record(value, ["fidelity", "issues"], [], "closed conversion reports");
  const fidelity = valueOf<unknown>(input, "fidelity");
  if (!["exact", "partial", "rejected"].includes(String(fidelity))) {
    fail("known conversion fidelity values");
  }
  const issues = values(valueOf(input, "issues"), "dense conversion issue arrays");
  issues.forEach(assertIssue);
  const dispositions = issues.map((issue) => (issue as ConversionIssue).disposition);
  if (fidelity === "exact" && dispositions.some((disposition) => disposition !== "preserved")) {
    fail("exact conversion reports without degraded or rejected semantics");
  }
  if (fidelity === "partial" && !dispositions.includes("degraded")) {
    fail("partial conversion reports to declare degraded semantics");
  }
  if (fidelity === "rejected" && !dispositions.includes("rejected")) {
    fail("rejected conversion reports to declare rejected semantics");
  }
}

export function assertSpecificationSourceSnapshot(
  value: unknown,
): asserts value is SpecificationSourceSnapshot {
  const input = record(
    value,
    [
      "sourceId",
      "format",
      "revision",
      "contentDigest",
      "observedAt",
      "role",
      "authority",
      "documents",
    ],
    ["extensions"],
    "closed detached source snapshots",
  );
  nonBlankId(valueOf(input, "sourceId"), "stable source identities");
  assertFormat(valueOf(input, "format"));
  nonBlankId(valueOf(input, "revision"), "stable source revisions");
  if (!isDigest(valueOf(input, "contentDigest"))) fail("SHA-256 source content digests");
  timestamp(valueOf(input, "observedAt"), "canonical source observation timestamps");
  if (!["primary", "overlay", "reference", "generated"].includes(String(valueOf(input, "role")))) {
    fail("known source roles");
  }
  if (!["authoritative", "advisory", "informative"].includes(String(valueOf(input, "authority")))) {
    fail("known source authority values");
  }
  const documents = values(valueOf(input, "documents"), "dense source document arrays");
  if (documents.length === 0) fail("at least one source document");
  const documentIds = documents.map((document) => {
    const item = record(document, ["documentId", "content"], [], "closed source documents");
    const documentId = nonBlankId(valueOf(item, "documentId"), "stable document identities");
    if (!isJsonValue(valueOf(item, "content"))) fail("strict JSON source document content");
    return documentId;
  });
  unique(documentIds, "unique source document identities");
  optionalExtensions(input);
}

function assertRelationship(value: unknown): asserts value is SpecificationRelationship {
  const input = record(
    value,
    ["relationshipId", "kind", "from", "to", "source"],
    ["extensions"],
    "closed specification relationships",
  );
  nonBlankId(valueOf(input, "relationshipId"), "stable relationship identities");
  if (
    ![
      "depends-on",
      "relates",
      "refines",
      "conflicts",
      "supersedes",
      "implements",
      "blocks",
    ].includes(String(valueOf(input, "kind")))
  ) {
    fail("known specification relationship kinds");
  }
  nonBlankId(valueOf(input, "from"), "stable relationship endpoint identities");
  nonBlankId(valueOf(input, "to"), "stable relationship endpoint identities");
  assertSourceBinding(valueOf(input, "source"));
  optionalExtensions(input);
}

export function assertSpecificationGraph(value: unknown): asserts value is SpecificationGraph {
  const input = record(
    value,
    ["graphId", "version", "sources", "nodes", "relationships"],
    ["report"],
    "closed specification graphs",
  );
  nonBlankId(valueOf(input, "graphId"), "stable graph identities");
  if (!isContractVersion(valueOf(input, "version"))) fail("SemVer graph versions");
  const sources = values(valueOf(input, "sources"), "dense source arrays");
  if (sources.length === 0) fail("at least one graph source");
  sources.forEach(assertSpecificationSourceSnapshot);
  const snapshots = sources as SpecificationSourceSnapshot[];
  unique(
    snapshots.map((source) => source.sourceId),
    "unique graph source identities",
  );
  const nodes = values(valueOf(input, "nodes"), "dense node arrays");
  nodes.forEach(assertSpecificationNode);
  const typedNodes = nodes as SpecificationNode[];
  unique(
    typedNodes.map((node) => node.nodeId),
    "unique graph node identities",
  );
  typedNodes.forEach((node) => assertKnownBinding(node.source, snapshots));
  const relationships = values(valueOf(input, "relationships"), "dense relationship arrays");
  relationships.forEach(assertRelationship);
  const typedRelationships = relationships as SpecificationRelationship[];
  unique(
    typedRelationships.map((relationship) => relationship.relationshipId),
    "unique graph relationship identities",
  );
  const nodeIds = new Set(typedNodes.map((node) => node.nodeId));
  const nodesById = new Map(typedNodes.map((node) => [node.nodeId, node] as const));
  typedNodes.forEach((node) => {
    if (semanticNodeKinds.includes(node.kind as never)) {
      assertSemanticNodeReferences(node as SpecificationSemanticNode, nodesById);
    }
  });
  typedRelationships.forEach((relationship) => {
    if (!nodeIds.has(relationship.from) || !nodeIds.has(relationship.to)) {
      fail("relationship endpoints that reference declared nodes");
    }
    assertKnownBinding(relationship.source, snapshots);
  });
  const report = valueOf<unknown>(input, "report");
  if (report !== undefined) {
    assertConversionReport(report);
    assertReportBindings(report, snapshots, nodeIds);
  }
}

export function assertSpecificationAdapterSupport(
  value: unknown,
): asserts value is SpecificationAdapterSupport {
  const input = record(
    value,
    [
      "format",
      "direction",
      "supportedVersions",
      "levels",
      "features",
      "preservedExtensionNamespaces",
      "sourceOwnership",
      "writeBack",
      "fixtures",
      "evidence",
    ],
    [],
    "closed adapter support declarations",
  );
  assertFormat(valueOf(input, "format"));
  if (!["import", "export", "both"].includes(String(valueOf(input, "direction")))) {
    fail("known adapter support directions");
  }
  const versions = values(valueOf(input, "supportedVersions"), "dense supported-version arrays");
  if (versions.length === 0 || !versions.every(isContractVersion))
    fail("non-empty SemVer supported versions");
  unique(versions as string[], "unique supported versions");
  const levels = values(valueOf(input, "levels"), "dense conformance level arrays");
  if (
    levels.length === 0 ||
    !levels.every((level) =>
      ["syntax", "semantic", "compilation", "round-trip", "lifecycle"].includes(String(level)),
    )
  ) {
    fail("non-empty known conformance levels");
  }
  unique(levels as string[], "unique conformance levels");
  const features = values(valueOf(input, "features"), "dense feature arrays");
  if (!features.every((feature) => typeof feature === "string" && feature.trim().length > 0)) {
    fail("non-blank supported features");
  }
  unique(features as string[], "unique supported features");
  const namespaces = values(
    valueOf(input, "preservedExtensionNamespaces"),
    "dense preserved-extension namespace arrays",
  );
  if (!namespaces.every(isExtensionNamespace)) fail("reverse-DNS preserved extension namespaces");
  unique(namespaces as string[], "unique preserved extension namespaces");
  if (!["source-owned", "adapter-owned"].includes(String(valueOf(input, "sourceOwnership")))) {
    fail("known adapter source ownership values");
  }
  const writeBack = String(valueOf(input, "writeBack"));
  if (!["unsupported", "proposal-only", "source-authorized"].includes(writeBack)) {
    fail("known adapter write-back behaviors");
  }
  if (writeBack === "source-authorized" && !levels.includes("lifecycle")) {
    fail("source-authorized write-back to declare lifecycle conformance");
  }
  const fixtures = values(valueOf(input, "fixtures"), "dense adapter fixture arrays");
  if (fixtures.length === 0) fail("at least one adapter support fixture");
  const fixtureIds = fixtures.map((fixture) => {
    const item = record(fixture, ["fixtureId", "digest"], [], "closed adapter fixtures");
    const fixtureId = nonBlankId(valueOf(item, "fixtureId"), "stable adapter fixture identities");
    if (!isDigest(valueOf(item, "digest"))) fail("SHA-256 adapter fixture digests");
    return fixtureId;
  });
  unique(fixtureIds, "unique adapter fixture identities");
  const evidence = values(valueOf(input, "evidence"), "dense adapter evidence arrays");
  if (evidence.length === 0) fail("at least one adapter support evidence binding");
  evidence.forEach(assertEvidenceBinding);
  unique(
    (evidence as SpecificationEvidenceBinding[]).map((binding) => binding.evidenceId),
    "unique adapter support evidence identities",
  );
}

function assertEvidenceBinding(value: unknown): asserts value is SpecificationEvidenceBinding {
  const input = record(value, ["evidenceId", "digest"], [], "closed evidence bindings");
  nonBlankId(valueOf(input, "evidenceId"), "stable evidence identities");
  if (!isDigest(valueOf(input, "digest"))) fail("SHA-256 evidence digests");
}

export function assertSpecificationDecisionRecord(
  value: unknown,
): asserts value is SpecificationDecisionRecord {
  const input = record(
    value,
    [
      "recordId",
      "resolvedDigest",
      "acceptedScope",
      "decision",
      "evidence",
      "authority",
      "policyVersions",
      "sources",
      "validity",
    ],
    [],
    "closed specification decision records",
  );
  nonBlankId(valueOf(input, "recordId"), "stable decision record identities");
  if (!isDigest(valueOf(input, "resolvedDigest"))) fail("SHA-256 resolved specification digests");
  const scope = values(valueOf(input, "acceptedScope"), "dense accepted-scope arrays");
  if (scope.length === 0) fail("non-empty accepted scopes");
  const scopeIds = scope.map((nodeId) =>
    nonBlankId(nodeId, "stable accepted-scope node identities"),
  );
  unique(scopeIds, "unique accepted-scope node identities");
  const decision = record(
    valueOf(input, "decision"),
    ["kind", "summary"],
    [],
    "closed decision summaries",
  );
  if (!["policy", "human", "combined"].includes(String(valueOf(decision, "kind")))) {
    fail("known decision summary kinds");
  }
  nonBlankText(valueOf(decision, "summary"), "non-blank decision summaries");
  const evidence = values(valueOf(input, "evidence"), "dense decision evidence arrays");
  if (evidence.length === 0) fail("at least one decision evidence binding");
  evidence.forEach(assertEvidenceBinding);
  unique(
    (evidence as SpecificationEvidenceBinding[]).map((binding) => binding.evidenceId),
    "unique decision evidence identities",
  );
  nonBlankId(valueOf(input, "authority"), "stable decision authority identities");
  const policies = values(valueOf(input, "policyVersions"), "dense policy-version arrays");
  if (policies.length === 0) fail("at least one decision policy version");
  const policyIds = policies.map((policy) => {
    const item = record(policy, ["policyId", "version"], [], "closed policy-version bindings");
    const policyId = nonBlankId(valueOf(item, "policyId"), "stable policy identities");
    if (!isContractVersion(valueOf(item, "version"))) fail("SemVer policy versions");
    return policyId;
  });
  unique(policyIds, "unique decision policy identities");
  const sources = values(valueOf(input, "sources"), "dense source-revision arrays");
  if (sources.length === 0) fail("at least one source-revision binding");
  const sourceIds = sources.map((source) => {
    const item = record(
      source,
      ["sourceId", "revision", "contentDigest"],
      [],
      "closed source-revision bindings",
    );
    const sourceId = nonBlankId(valueOf(item, "sourceId"), "stable source identities");
    nonBlankId(valueOf(item, "revision"), "stable source revisions");
    if (!isDigest(valueOf(item, "contentDigest"))) fail("SHA-256 source content digests");
    return sourceId;
  });
  unique(sourceIds, "unique decision source identities");
  const validity = record(
    valueOf(input, "validity"),
    ["invalidatedBy"],
    ["expiresAt"],
    "closed validity rules",
  );
  const expiresAt = valueOf<unknown>(validity, "expiresAt");
  if (expiresAt !== undefined) timestamp(expiresAt, "canonical decision expiry timestamps");
  const invalidatedBy = values(
    valueOf(validity, "invalidatedBy"),
    "dense invalidation-condition arrays",
  );
  if (
    invalidatedBy.length === 0 ||
    !invalidatedBy.every((condition) =>
      ["source-revision", "policy-version", "scope-change"].includes(String(condition)),
    )
  ) {
    fail("non-empty known invalidation conditions");
  }
  unique(invalidatedBy as string[], "unique invalidation conditions");
  if (expiresAt === undefined && invalidatedBy.length === 0)
    fail("expiry or invalidation conditions");
}

export function assertSpecificationDecision(
  value: unknown,
): asserts value is SpecificationDecision {
  const input = record(
    value,
    ["status"],
    ["record", "issues", "questions"],
    "closed specification decisions",
  );
  const status = valueOf<unknown>(input, "status");
  if (status === "accepted" && hasOnlyKeys(input, ["status", "record"])) {
    assertSpecificationDecisionRecord(valueOf(input, "record"));
    return;
  }
  if (status === "rejected" && hasOnlyKeys(input, ["status", "issues"])) {
    const issues = values(valueOf(input, "issues"), "dense rejection issue arrays");
    if (issues.length === 0) fail("non-empty rejection issues");
    issues.forEach(assertIssue);
    return;
  }
  if (status === "needs-input" && hasOnlyKeys(input, ["status", "questions"])) {
    const questions = values(valueOf(input, "questions"), "dense question arrays");
    if (questions.length === 0) fail("non-empty unresolved questions");
    const ids = questions.map((question) => {
      const item = record(
        question,
        ["questionId", "prompt", "source"],
        [],
        "closed unresolved questions",
      );
      const questionId = nonBlankId(valueOf(item, "questionId"), "stable question identities");
      nonBlankText(valueOf(item, "prompt"), "non-blank question prompts");
      assertSourceBinding(valueOf(item, "source"));
      return questionId;
    });
    unique(ids, "unique unresolved question identities");
    return;
  }
  fail("exact accepted, rejected, or needs-input decision branches");
}

export function assertProposedSpecificationChange(
  value: unknown,
): asserts value is ProposedSpecificationChange {
  const input = record(
    value,
    ["changeId", "target", "changes", "originatingDecision", "evidence", "conversion"],
    [],
    "closed proposed specification changes",
  );
  nonBlankId(valueOf(input, "changeId"), "stable proposed-change identities");
  const target = record(
    valueOf(input, "target"),
    ["sourceId", "format", "baseRevision", "baseDigest"],
    [],
    "closed proposed-change targets",
  );
  nonBlankId(valueOf(target, "sourceId"), "stable proposed-change source identities");
  assertFormat(valueOf(target, "format"));
  nonBlankId(valueOf(target, "baseRevision"), "stable proposed-change base revisions");
  if (!isDigest(valueOf(target, "baseDigest"))) fail("SHA-256 proposed-change base digests");
  if (!isJsonValue(valueOf(input, "changes"))) fail("strict JSON proposed semantic changes");
  const origin = record(
    valueOf(input, "originatingDecision"),
    ["recordId", "resolvedDigest"],
    [],
    "closed originating decision bindings",
  );
  nonBlankId(valueOf(origin, "recordId"), "stable originating decision record identities");
  if (!isDigest(valueOf(origin, "resolvedDigest"))) fail("SHA-256 originating resolved digests");
  const evidence = values(valueOf(input, "evidence"), "dense proposed-change evidence arrays");
  if (evidence.length === 0) fail("at least one proposed-change evidence binding");
  evidence.forEach(assertEvidenceBinding);
  unique(
    (evidence as SpecificationEvidenceBinding[]).map((binding) => binding.evidenceId),
    "unique proposed-change evidence identities",
  );
  assertConversionReport(valueOf(input, "conversion"));
}

export const assertPortableSpecificationInput = (value: unknown): void => {
  if (!isJsonValue(value))
    fail("strict JSON portable data without accessors, proxies, symbols, cycles, or sparse arrays");
};
