import { isContractVersion, isDigest, isExternalId, isJsonValue } from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import {
  createSpecificationDecision,
  createSpecificationGraph,
} from "../../features/specifications/factory";
import type {
  SpecificationDecisionRecord,
  SpecificationGraph,
  SpecificationPolicyVersion,
  SpecificationSourceRevisionBinding,
} from "../../features/specifications/types";
import { reviewSpecificationGraph } from "./resolution";
import type {
  AcceptedSpecificationHandle,
  CompilationAuthoritySnapshot,
  CompiledSpecification,
  RegisterAcceptedSpecificationInput,
  SpecificationAuthorityDependencies,
  SpecificationAuthorityState,
  VerifyCompilationAuthorityInput,
} from "./types";

const acceptedHandles = new WeakSet<object>();
const compiledSpecifications = new WeakSet<object>();

const canonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const sameDigest = (left: { algorithm: string; value: string }, right: typeof left): boolean =>
  left.algorithm === right.algorithm && left.value === right.value;

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length &&
  [...left].sort().every((value, index) => value === [...right].sort()[index]);

const samePolicies = (
  left: readonly SpecificationPolicyVersion[],
  right: readonly SpecificationPolicyVersion[],
): boolean =>
  sameStrings(
    left.map((policy) => `${policy.policyId}:${policy.version}`),
    right.map((policy) => `${policy.policyId}:${policy.version}`),
  );

const sameSources = (
  left: readonly SpecificationSourceRevisionBinding[],
  right: readonly SpecificationSourceRevisionBinding[],
): boolean =>
  sameStrings(
    left.map((source) => `${source.sourceId}:${source.revision}:${source.contentDigest.value}`),
    right.map((source) => `${source.sourceId}:${source.revision}:${source.contentDigest.value}`),
  );

const validPolicies = (value: unknown): value is readonly SpecificationPolicyVersion[] =>
  Array.isArray(value) &&
  value.every(
    (policy) =>
      isPortableRecord(policy) &&
      hasOnlyKeys(policy, ["policyId", "version"]) &&
      isExternalId(policy.policyId) &&
      isContractVersion(policy.version),
  );

const validSources = (value: unknown): value is readonly SpecificationSourceRevisionBinding[] =>
  Array.isArray(value) &&
  value.every(
    (source) =>
      isPortableRecord(source) &&
      hasOnlyKeys(source, ["sourceId", "revision", "contentDigest"]) &&
      isExternalId(source.sourceId) &&
      isExternalId(source.revision) &&
      isDigest(source.contentDigest),
  );

const captureCurrentState = (value: unknown): SpecificationAuthorityState => {
  if (
    !isJsonValue(value) ||
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, [
      "authority",
      "resolvedDigest",
      "acceptedScope",
      "policyVersions",
      "sources",
    ]) ||
    !isExternalId(value.authority) ||
    !isDigest(value.resolvedDigest) ||
    !Array.isArray(value.acceptedScope) ||
    !value.acceptedScope.every(isExternalId) ||
    !validPolicies(value.policyVersions) ||
    !validSources(value.sources)
  ) {
    throw new TypeError("Specification authority state must be closed, portable current state.");
  }
  return cloneFrozen(value) as unknown as SpecificationAuthorityState;
};

const assertGraphBindings = (
  record: SpecificationDecisionRecord,
  graph: SpecificationGraph,
): void => {
  const nodeIds = new Set(graph.nodes.map((node) => node.nodeId));
  if (!record.acceptedScope.every((nodeId) => nodeIds.has(nodeId))) {
    throw new TypeError("Accepted specification scope must reference graph nodes.");
  }
  const graphSources = graph.sources.map((source) => ({
    sourceId: source.sourceId,
    revision: source.revision,
    contentDigest: source.contentDigest,
  }));
  if (!sameSources(record.sources, graphSources)) {
    throw new TypeError("Accepted specification sources must match the reviewed graph.");
  }
};

const assertCurrentBindings = (
  record: SpecificationDecisionRecord,
  current: SpecificationAuthorityState,
): void => {
  if (
    record.authority !== current.authority ||
    !sameDigest(record.resolvedDigest, current.resolvedDigest) ||
    !sameStrings(record.acceptedScope, current.acceptedScope) ||
    !samePolicies(record.policyVersions, current.policyVersions) ||
    !sameSources(record.sources, current.sources)
  ) {
    throw new TypeError("Specification authority state no longer matches the accepted decision.");
  }
};

const assertCurrentSnapshot = (
  snapshot: CompilationAuthoritySnapshot,
  current: SpecificationAuthorityState,
): void => {
  if (
    snapshot.authority !== current.authority ||
    !sameDigest(snapshot.resolvedDigest, current.resolvedDigest) ||
    !sameStrings(snapshot.acceptedScope, current.acceptedScope) ||
    !samePolicies(snapshot.policyVersions, current.policyVersions) ||
    !sameSources(snapshot.sources, current.sources)
  ) {
    throw new TypeError("Compilation authority state has changed.");
  }
};

const assertNotExpired = (record: SpecificationDecisionRecord, now: unknown): string => {
  if (!canonicalTimestamp(now)) {
    throw new TypeError("Specification authority requires a trusted canonical clock.");
  }
  if (
    record.validity.expiresAt !== undefined &&
    Date.parse(now) >= Date.parse(record.validity.expiresAt)
  ) {
    throw new TypeError("Accepted specification decision has expired.");
  }
  return now;
};

const snapshot = (
  current: SpecificationAuthorityState,
  checkedAt: string,
): CompilationAuthoritySnapshot => cloneFrozen({ ...current, checkedAt });

const checkAccepted = (
  accepted: AcceptedSpecificationHandle,
  current: SpecificationAuthorityState,
  dependencies: SpecificationAuthorityDependencies,
): CompilationAuthoritySnapshot => {
  if (!isAcceptedSpecificationHandle(accepted)) {
    throw new TypeError("Compilation requires a registered accepted specification handle.");
  }
  assertGraphBindings(accepted.record, accepted.graph);
  assertCurrentBindings(accepted.record, current);
  return snapshot(current, assertNotExpired(accepted.record, dependencies.clock.now()));
};

export const registerAcceptedSpecification = (
  input: RegisterAcceptedSpecificationInput,
): MaybePromise<AcceptedSpecificationHandle> => {
  const graph = createSpecificationGraph(input.graph);
  const decision = createSpecificationDecision(input.decision);
  if (decision.status !== "accepted") {
    throw new TypeError("Only an accepted specification decision can be registered.");
  }
  const review = reviewSpecificationGraph(graph, decision);
  if (review.decision.status !== "accepted") {
    throw new TypeError("Specification review must be accepted before registration.");
  }
  assertGraphBindings(decision.record, graph);
  return maybeMap(
    (value) => {
      const current = captureCurrentState(value);
      checkAcceptedRegistration({
        record: decision.record,
        graph,
        current,
        dependencies: input.authority,
      });
      const handle = Object.freeze({
        record: decision.record,
        graph,
      }) as AcceptedSpecificationHandle;
      acceptedHandles.add(handle);
      return handle;
    },
    input.authority.currentState.current({ record: decision.record, graph }),
  );
};

const checkAcceptedRegistration = (input: {
  readonly record: SpecificationDecisionRecord;
  readonly graph: SpecificationGraph;
  readonly current: SpecificationAuthorityState;
  readonly dependencies: SpecificationAuthorityDependencies;
}): void => {
  assertGraphBindings(input.record, input.graph);
  assertCurrentBindings(input.record, input.current);
  assertNotExpired(input.record, input.dependencies.clock.now());
};

export const isAcceptedSpecificationHandle = (
  value: unknown,
): value is AcceptedSpecificationHandle =>
  typeof value === "object" && value !== null && acceptedHandles.has(value);

export const captureCompilationAuthority = (
  accepted: AcceptedSpecificationHandle,
  dependencies: SpecificationAuthorityDependencies,
): MaybePromise<CompilationAuthoritySnapshot> => {
  if (!isAcceptedSpecificationHandle(accepted)) {
    throw new TypeError("Compilation requires a registered accepted specification handle.");
  }
  return maybeMap(
    (value) => checkAccepted(accepted, captureCurrentState(value), dependencies),
    dependencies.currentState.current({ record: accepted.record, graph: accepted.graph }),
  );
};

export const registerCompiledSpecification = <T>(input: {
  readonly accepted: AcceptedSpecificationHandle;
  readonly authority: CompilationAuthoritySnapshot;
  readonly value: T;
}): CompiledSpecification<T> => {
  if (!isAcceptedSpecificationHandle(input.accepted)) {
    throw new TypeError("Compiled specifications require registered accepted provenance.");
  }
  const compiled = Object.freeze({
    compilationId: crypto.randomUUID(),
    value: input.value,
    accepted: input.accepted,
    authority: cloneFrozen(input.authority),
  }) as CompiledSpecification<T>;
  compiledSpecifications.add(compiled);
  return compiled;
};

export const verifyCompilationAuthority = <T>(
  input: VerifyCompilationAuthorityInput<T>,
): MaybePromise<void> => {
  if (
    typeof input.compiled !== "object" ||
    input.compiled === null ||
    !compiledSpecifications.has(input.compiled) ||
    !isAcceptedSpecificationHandle(input.compiled.accepted)
  ) {
    throw new TypeError("Compilation authority requires a registered compiled specification.");
  }
  return maybeMap(
    (value) => {
      const current = captureCurrentState(value);
      checkAccepted(input.compiled.accepted, current, input.authority);
      assertCurrentSnapshot(input.compiled.authority, current);
    },
    input.authority.currentState.current({
      record: input.compiled.accepted.record,
      graph: input.compiled.accepted.graph,
    }),
  );
};
