import { isContractVersion, isDigest, isExtensionNamespace, isJsonValue } from "#contracts";
import { hasOnlyKeys } from "#shared/portable-data";
import type {
  ProposedSpecificationChange,
  SpecificationAdapterSupport,
  SpecificationDecision,
  SpecificationDecisionRecord,
  SpecificationEvidenceBinding,
  SpecificationFormat,
  SpecificationGraph,
  SpecificationDiagnostic,
  SpecificationNode,
  SpecificationOperation,
  SpecificationSemanticNode,
  SpecificationRelationship,
  SpecificationSourceBinding,
  SpecificationSourceSnapshot,
} from "./types";
import { assertKnownBinding } from "./graph-bindings";
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

function assertDiagnostic(value: unknown): asserts value is SpecificationDiagnostic {
  const input = record(
    value,
    ["code", "severity", "impact", "explanation"],
    ["source", "nodeId"],
    "closed specification diagnostics",
  );
  nonBlankText(valueOf(input, "code"), "non-blank specification diagnostic codes");
  if (!["info", "warning", "error"].includes(String(valueOf(input, "severity")))) {
    fail("known specification diagnostic severities");
  }
  if (!["advisory", "blocking"].includes(String(valueOf(input, "impact")))) {
    fail("known specification diagnostic impacts");
  }
  nonBlankText(valueOf(input, "explanation"), "non-blank specification diagnostic explanations");
  const source = valueOf<unknown>(input, "source");
  const nodeId = valueOf<unknown>(input, "nodeId");
  if ((source === undefined) === (nodeId === undefined)) {
    fail("each specification diagnostic to identify exactly one source location or node");
  }
  if (source !== undefined) assertSourceBinding(source);
  if (nodeId !== undefined) nonBlankId(nodeId, "stable specification node identities");
}

const operationIds = [
  "observe-native-source",
  "derive-portable-specification",
  "compile-portable-specification",
  "export-native-source",
  "round-trip-native-source",
] as const;

const assertFixture = (value: unknown): string => {
  const item = record(value, ["fixtureId", "digest"], [], "closed operation fixtures");
  const fixtureId = nonBlankId(valueOf(item, "fixtureId"), "stable operation fixture identities");
  if (!isDigest(valueOf(item, "digest"))) fail("SHA-256 operation fixture digests");
  return fixtureId;
};

const assertSourceContract = (value: unknown): void => {
  const input = record(
    value,
    ["authority", "format", "revision"],
    [],
    "closed specification source contracts",
  );
  nonBlankText(valueOf(input, "authority"), "recognised source-contract authorities");
  assertFormat(valueOf(input, "format"));
  nonBlankId(valueOf(input, "revision"), "immutable source-contract revisions");
};

export function assertSpecificationOperation(
  value: unknown,
): asserts value is SpecificationOperation {
  const input = record(
    value,
    ["operation", "sourceContract", "disposition", "diagnostics"],
    ["fixtures", "reason", "evidence"],
    "closed specification operation declarations",
  );
  if (!operationIds.includes(valueOf(input, "operation") as never)) {
    fail("known specification operation identities");
  }
  assertSourceContract(valueOf(input, "sourceContract"));
  const diagnostics = values(valueOf(input, "diagnostics"), "dense operation diagnostics");
  diagnostics.forEach(assertDiagnostic);
  const disposition = valueOf(input, "disposition");
  if (
    disposition === "supported" &&
    hasOnlyKeys(input, ["operation", "sourceContract", "disposition", "diagnostics", "fixtures"])
  ) {
    const fixtures = values(valueOf(input, "fixtures"), "dense supported-operation fixtures");
    if (fixtures.length === 0) fail("at least one supported-operation fixture");
    unique(fixtures.map(assertFixture), "unique supported-operation fixture identities");
    if (
      diagnostics.some(
        (diagnostic) => (diagnostic as SpecificationDiagnostic).impact === "blocking",
      )
    ) {
      fail("supported operations without blocking diagnostics");
    }
    return;
  }
  if (
    disposition === "unsupported" &&
    hasOnlyKeys(input, ["operation", "sourceContract", "disposition", "diagnostics", "reason"])
  ) {
    nonBlankText(valueOf(input, "reason"), "unsupported-operation reasons");
    return;
  }
  if (
    disposition === "not-applicable" &&
    hasOnlyKeys(input, [
      "operation",
      "sourceContract",
      "disposition",
      "diagnostics",
      "reason",
      "evidence",
    ])
  ) {
    nonBlankText(valueOf(input, "reason"), "not-applicable operation reasons");
    const evidence = values(valueOf(input, "evidence"), "dense not-applicable evidence arrays");
    if (evidence.length === 0) fail("source-contract evidence for not-applicable operations");
    evidence.forEach(assertEvidenceBinding);
    return;
  }
  fail("exact supported, unsupported, or not-applicable operation branches");
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
    [],
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
}

export function assertSpecificationAdapterSupport(
  value: unknown,
): asserts value is SpecificationAdapterSupport {
  const input = record(
    value,
    ["format", "authority", "revision", "sourceOwnership", "operations"],
    [],
    "closed adapter support declarations",
  );
  assertFormat(valueOf(input, "format"));
  nonBlankText(valueOf(input, "authority"), "recognised adapter authorities");
  nonBlankId(valueOf(input, "revision"), "immutable adapter revisions");
  if (!["source-owned", "adapter-owned"].includes(String(valueOf(input, "sourceOwnership")))) {
    fail("known adapter source ownership values");
  }
  const operations = values(valueOf(input, "operations"), "dense adapter operation arrays");
  if (operations.length !== operationIds.length) {
    fail("a closed adapter operation matrix covering all five operation identities");
  }
  operations.forEach(assertSpecificationOperation);
  const typedOperations = operations as SpecificationOperation[];
  unique(
    typedOperations.map((operation) => operation.operation),
    "unique adapter operation identities",
  );
  if (typedOperations.some(({ operation }, index) => operation !== operationIds[index])) {
    fail("a closed adapter operation matrix in canonical operation-family order");
  }
  const authority = valueOf<string>(input, "authority");
  const revision = valueOf<string>(input, "revision");
  const format = valueOf<SpecificationFormat>(input, "format");
  if (
    typedOperations.some(
      ({ sourceContract }) =>
        sourceContract.authority !== authority ||
        sourceContract.revision !== revision ||
        sourceContract.format.id !== format.id ||
        sourceContract.format.version !== format.version,
    )
  ) {
    fail("operation source contracts exactly matching adapter authority, format, and revision");
  }
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
    issues.forEach(assertDiagnostic);
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
    ["changeId", "target", "changes", "originatingDecision", "evidence", "operation"],
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
  const operation = valueOf<SpecificationOperation>(input, "operation");
  assertSpecificationOperation(operation);
  if (operation.operation !== "export-native-source") {
    fail("proposed changes bound to the native-source export operation family");
  }
  const targetFormat = valueOf<SpecificationFormat>(target, "format");
  if (
    operation.sourceContract.format.id !== targetFormat.id ||
    operation.sourceContract.format.version !== targetFormat.version
  ) {
    fail("proposed-change operations bound to the exact target format");
  }
  if (operation.disposition === "not-applicable") {
    fail("proposed-change export operations model unavailable support as unsupported");
  }
}

export const assertPortableSpecificationInput = (value: unknown): void => {
  if (!isJsonValue(value))
    fail("strict JSON portable data without accessors, proxies, symbols, cycles, or sparse arrays");
};
