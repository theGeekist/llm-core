import type { ContractVersion, Digest, NativeExtensions } from "#contracts";
import { maybeChain, maybeMap, type MaybePromise } from "#shared/maybe";
import { cloneFrozen } from "#shared/portable-data";
import { createSpecificationGraph } from "../features/specifications/runtime";
import type { SpecificationAuthorityState } from "../application/specification-compiler/types";
import {
  bindCompiledSpecificationAuthority,
  registerAcceptedSpecification,
} from "../application/specification-compiler/runtime";
import { prepareSpecificationExecution } from "../application/specification-compiler/public";
import type {
  PreparedSpecificationExecution,
  SpecificationExecutionOperations,
} from "../application/specification-compiler/public";
import { compileSpecification as compileRegisteredSpecification } from "../application/specification-compiler/compiler";
import { reviewSpecificationGraph } from "../application/specification-compiler/resolution";
import { graphFromSource } from "./loading";
import {
  createConversionReport,
  createProposedSpecificationChange,
  createSpecificationAdapterSupport,
  createSpecificationDecision,
  createSpecificationDecisionRecord,
  createPortableIntegrationReference,
  createSpecificationSourceSnapshot as createSourceSnapshot,
} from "../features/specifications/public";
import type {
  AgentIntent,
  ApplicationIntent,
  ApprovalIntent,
  CapabilityIntent,
  ContextIntent,
  ConversionFidelity,
  ConversionIssue,
  ConversionIssueDisposition,
  ConversionIssueSeverity,
  ConversionReport,
  ProposedSpecificationChange,
  ProposedSpecificationChangeId,
  EvaluationIntent,
  PortableIntegrationReference,
  PortableIntegrationReferenceInput,
  PortableSpecificationTarget,
  SpecificationAdapterDirection,
  SpecificationAdapterFixture,
  SpecificationAdapterSourceOwnership,
  SpecificationAdapterSupport,
  SpecificationAdapterWriteBack,
  SpecificationConformanceLevel,
  SpecificationDecision,
  SpecificationDecisionRecord,
  SpecificationDecisionRecordId,
  SpecificationDecisionSummary,
  SpecificationDecisionValidity,
  SpecificationDocumentNodeKind,
  SpecificationEvidenceBinding,
  SpecificationFormat,
  SpecificationNode,
  SpecificationNodeKind,
  SpecificationPolicyVersion,
  SpecificationQuestion,
  SpecificationSemanticNodeKind,
  SpecificationSourceAuthority,
  SpecificationSourceBinding,
  SpecificationSourceDocument,
  SpecificationSourceId,
  SpecificationSourceRevisionBinding,
  SpecificationSourceRole,
  SpecificationSourceSnapshot,
  ToolIntent,
  WorkflowIntent,
} from "../features/specifications/public";
import type {
  CompiledSpecification,
  SpecificationAuthorityDependencies,
} from "../application/specification-compiler/types";

export {
  createConversionReport,
  createProposedSpecificationChange,
  createSpecificationAdapterSupport,
  createSpecificationDecision,
  createSpecificationDecisionRecord,
  createPortableIntegrationReference,
  createSourceSnapshot as createSpecificationSourceSnapshot,
};
export type {
  AgentIntent,
  ApplicationIntent,
  ApprovalIntent,
  CapabilityIntent,
  CompiledSpecification,
  ConversionFidelity,
  ConversionIssue,
  ConversionIssueDisposition,
  ConversionIssueSeverity,
  ConversionReport,
  ContextIntent,
  EvaluationIntent,
  PortableIntegrationReference,
  PortableIntegrationReferenceInput,
  PortableSpecificationTarget,
  ProposedSpecificationChange,
  ProposedSpecificationChangeId,
  SpecificationAdapterDirection,
  SpecificationAdapterFixture,
  SpecificationAdapterSourceOwnership,
  SpecificationAdapterSupport,
  SpecificationAdapterWriteBack,
  SpecificationConformanceLevel,
  SpecificationDecision,
  SpecificationDecisionRecord,
  SpecificationDecisionRecordId,
  SpecificationDecisionSummary,
  SpecificationDecisionValidity,
  SpecificationDocumentNodeKind,
  SpecificationEvidenceBinding,
  SpecificationFormat,
  SpecificationNodeKind,
  SpecificationPolicyVersion,
  SpecificationQuestion,
  SpecificationSemanticNodeKind,
  SpecificationSourceAuthority,
  SpecificationSourceBinding,
  SpecificationSourceDocument,
  SpecificationSourceId,
  SpecificationSourceRevisionBinding,
  SpecificationSourceRole,
  SpecificationSourceSnapshot,
  ToolIntent,
  WorkflowIntent,
  PreparedSpecificationExecution,
  SpecificationExecutionOperations,
};
export { prepareSpecificationExecution };

/** A stable, reviewable ID that can be selected in an accepted decision scope. */
export type SpecificationScopeId = SpecificationDecisionRecord["acceptedScope"][number];

/**
 * A loaded portable specification. Its reconciled graph stays private so
 * callers cannot bypass review by reconstructing compiler state.
 */
export interface Specification {
  readonly sources: readonly SpecificationSourceSnapshot[];
  readonly report?: ConversionReport;
}

/** One typed portable item a review policy may select into an accepted scope. */
export type SpecificationReviewItem = SpecificationNode extends infer TNode
  ? TNode extends SpecificationNode
    ? Omit<TNode, "nodeId"> & { readonly scopeId: SpecificationScopeId }
    : never
  : never;

/** A traced relationship between reviewable scope items. */
export interface SpecificationReviewRelationship {
  readonly relationshipId: string;
  readonly kind:
    | "depends-on"
    | "relates"
    | "refines"
    | "conflicts"
    | "supersedes"
    | "implements"
    | "blocks";
  readonly from: SpecificationScopeId;
  readonly to: SpecificationScopeId;
  readonly source: SpecificationSourceBinding;
  readonly extensions?: NativeExtensions;
}

/**
 * Immutable selection material derived by core before a policy decides. It
 * intentionally describes the graph without exporting its canonical runtime
 * representation or any authority-bearing compiler state.
 */
export interface SpecificationReviewView {
  readonly items: readonly SpecificationReviewItem[];
  readonly relationships: readonly SpecificationReviewRelationship[];
  readonly dependency: {
    readonly orderedScopeIds: readonly SpecificationScopeId[];
    readonly blockedScopeIds: readonly SpecificationScopeId[];
  };
  readonly workflow: {
    readonly scopeIds: readonly SpecificationScopeId[];
  };
  readonly issues: readonly ConversionIssue[];
  readonly questions: readonly SpecificationQuestion[];
}

/** The current state a review policy attests before acceptance or compilation. */
export interface SpecificationPolicyCurrentState {
  readonly authority: string;
  readonly resolvedDigest: Digest;
  readonly acceptedScope: readonly SpecificationScopeId[];
  readonly policyVersions: readonly {
    readonly policyId: string;
    readonly version: ContractVersion;
  }[];
  readonly sources: readonly {
    readonly sourceId: string;
    readonly revision: string;
    readonly contentDigest: Digest;
  }[];
}

/**
 * Application policy supplies the decision and current bindings. The facade
 * adapts it to the private authority registry; callers never receive a handle
 * or authority snapshot.
 */
export interface SpecificationPolicy {
  decide(input: {
    readonly specification: Specification;
    readonly review: SpecificationReviewView;
    readonly evidence: readonly SpecificationEvidenceBinding[];
  }): MaybePromise<SpecificationDecision>;
  current(input: {
    readonly record: SpecificationDecisionRecord;
    readonly specification: Specification;
  }): MaybePromise<SpecificationPolicyCurrentState>;
  now(): string;
}

export interface ReviewSpecificationOptions {
  readonly policy?: SpecificationPolicy;
  readonly evidence?: readonly SpecificationEvidenceBinding[];
}

export interface CompileSpecificationOptions<T> {
  /** Portable declarative data or a serialized integration reference; never a live native object. */
  readonly target: T & PortableSpecificationTarget<T>;
}

/**
 * Defers adapter projection until the accepted decision has passed a fresh
 * current-authority check inside the application compiler.
 */
export interface ProjectSpecificationOptions<T, TResult> {
  readonly project: (view: SpecificationProjectionView) => MaybePromise<{
    readonly target: T & PortableSpecificationTarget<T>;
    readonly result: TResult;
  }>;
}

/** Frozen, public review material limited to the exact accepted scope. */
export interface SpecificationProjectionView {
  readonly acceptedItems: readonly SpecificationReviewItem[];
}

export interface ProjectSpecificationResult<T, TResult> {
  readonly compiled: CompiledSpecification<T>;
  readonly result: TResult;
}

interface ReviewBinding {
  readonly graph: ReturnType<typeof createSpecificationGraph>;
  readonly authority: SpecificationAuthorityDependencies;
  readonly projection: SpecificationProjectionView;
}

const loadedGraphs = new WeakMap<Specification, ReturnType<typeof createSpecificationGraph>>();
const loadedReviewViews = new WeakMap<Specification, SpecificationReviewView>();
const reviewBindings = new WeakMap<SpecificationDecision, ReviewBinding>();

const graphFor = (specification: Specification): ReturnType<typeof createSpecificationGraph> => {
  const graph = loadedGraphs.get(specification);
  if (graph === undefined) {
    throw new TypeError("Specifications must be loaded by loadSpecification before review.");
  }
  return graph;
};

const reviewViewForGraph = (
  graph: ReturnType<typeof createSpecificationGraph>,
): SpecificationReviewView => {
  const review = reviewSpecificationGraph(graph);
  return cloneFrozen({
    items: graph.nodes.map(
      (node): SpecificationReviewItem =>
        ({
          scopeId: node.nodeId,
          kind: node.kind,
          title: node.title,
          source: node.source,
          ...(node.content === undefined ? {} : { content: node.content }),
          ...(node.extensions === undefined ? {} : { extensions: node.extensions }),
        }) as SpecificationReviewItem,
    ),
    relationships: graph.relationships.map((relationship) => ({
      relationshipId: relationship.relationshipId,
      kind: relationship.kind,
      from: relationship.from,
      to: relationship.to,
      source: relationship.source,
      ...(relationship.extensions === undefined ? {} : { extensions: relationship.extensions }),
    })),
    dependency: {
      orderedScopeIds: review.dependency.orderedNodeIds,
      blockedScopeIds: review.dependency.blockedNodeIds,
    },
    workflow: { scopeIds: review.workflow.nodeIds },
    issues: review.issues,
    questions: review.questions,
  });
};

const reviewViewFor = (specification: Specification): SpecificationReviewView => {
  const review = loadedReviewViews.get(specification);
  if (review === undefined) {
    throw new TypeError("Specifications must be loaded by loadSpecification before review.");
  }
  return review;
};

/**
 * Captures either an adapter-produced canonical import or a detached source
 * snapshot. Loading observes data only; it cannot make an acceptance decision.
 */
export const loadSpecification = (source: unknown): Specification => {
  const graph = graphFromSource(source);
  const specification = Object.freeze({
    sources: graph.sources,
    ...(graph.report === undefined ? {} : { report: graph.report }),
  });
  loadedGraphs.set(specification, graph);
  loadedReviewViews.set(specification, reviewViewForGraph(graph));
  return specification;
};

const policyAuthority = (
  policy: SpecificationPolicy,
  specification: Specification,
): SpecificationAuthorityDependencies => ({
  currentState: {
    current: ({ record }) =>
      policy.current({ record, specification }) as MaybePromise<SpecificationAuthorityState>,
  },
  clock: { now: () => policy.now() },
});

const recordDecision = (input: {
  readonly decision: SpecificationDecision;
  readonly graph: ReturnType<typeof createSpecificationGraph>;
  readonly review: SpecificationReviewView;
  readonly authority?: SpecificationAuthorityDependencies;
}): MaybePromise<SpecificationDecision> => {
  const reviewed = reviewSpecificationGraph(input.graph, input.decision).decision;
  if (reviewed.status !== "accepted") return reviewed;
  if (input.authority === undefined) {
    throw new TypeError("Accepted specification decisions require a review policy.");
  }
  return maybeMap(
    () => {
      const acceptedScope = new Set(reviewed.record.acceptedScope);
      reviewBindings.set(reviewed, {
        graph: input.graph,
        authority: input.authority!,
        projection: cloneFrozen({
          acceptedItems: input.review.items.filter((item) => acceptedScope.has(item.scopeId)),
        }),
      });
      return reviewed;
    },
    registerAcceptedSpecification({
      graph: input.graph,
      decision: reviewed,
      authority: input.authority,
    }),
  );
};

/**
 * Resolves one loaded specification through application policy and evidence.
 * Only accepted results that complete current-authority registration can be
 * passed to compileSpecification.
 */
export const reviewSpecification = (
  specification: Specification,
  options: ReviewSpecificationOptions = {},
): MaybePromise<SpecificationDecision> => {
  const graph = graphFor(specification);
  const review = reviewViewFor(specification);
  if (options.policy === undefined) {
    return recordDecision({
      decision: reviewSpecificationGraph(graph).decision,
      graph,
      review,
    });
  }
  const authority = policyAuthority(options.policy, specification);
  return maybeChain(
    (decision) => recordDecision({ decision, graph, review, authority }),
    options.policy.decide({
      specification,
      review: reviewViewFor(specification),
      evidence: options.evidence ?? [],
    }),
  );
};

/**
 * Compiles only the exact accepted decision returned from reviewSpecification.
 * The target is captured as portable data and its current authority remains
 * module-private for later controlled Agent, workflow, or tool checks.
 */
export const compileSpecification = <T>(
  decision: SpecificationDecision,
  options: CompileSpecificationOptions<T>,
): MaybePromise<CompiledSpecification<T>> => {
  if (decision.status !== "accepted") {
    throw new TypeError("Only accepted specification decisions can be compiled.");
  }
  const binding = reviewBindings.get(decision);
  if (binding === undefined) {
    throw new TypeError(
      "Specifications must complete review with current authority before compilation.",
    );
  }
  return maybeChain(
    (accepted) =>
      maybeMap(
        (compiled) => {
          bindCompiledSpecificationAuthority(compiled, binding.authority);
          return compiled;
        },
        compileRegisteredSpecification({
          accepted,
          authority: binding.authority,
          compiler: { compile: () => options.target },
        }),
      ),
    registerAcceptedSpecification({
      graph: binding.graph,
      decision,
      authority: binding.authority,
    }),
  );
};

/**
 * Runs an adapter projector only after current acceptance authority has been
 * validated. Async projection is revalidated again before its target is
 * registered as a compiled specification.
 */
export const projectSpecification = <T, TResult>(
  decision: SpecificationDecision,
  options: ProjectSpecificationOptions<T, TResult>,
): MaybePromise<ProjectSpecificationResult<T, TResult>> => {
  if (decision.status !== "accepted") {
    throw new TypeError("Only accepted specification decisions can be projected.");
  }
  const binding = reviewBindings.get(decision);
  if (binding === undefined) {
    throw new TypeError(
      "Specifications must complete review with current authority before projection.",
    );
  }
  return maybeChain(
    (accepted) => {
      let projectionResult!: TResult;
      let projected = false;
      return maybeMap(
        (compiled) => {
          if (!projected) {
            throw new TypeError("Specification projector did not produce a result.");
          }
          bindCompiledSpecificationAuthority(compiled, binding.authority);
          return Object.freeze({ compiled, result: projectionResult });
        },
        compileRegisteredSpecification({
          accepted,
          authority: binding.authority,
          compiler: {
            compile: () =>
              maybeMap((projection) => {
                projectionResult = projection.result;
                projected = true;
                return projection.target;
              }, options.project(binding.projection)),
          },
        }),
      );
    },
    registerAcceptedSpecification({
      graph: binding.graph,
      decision,
      authority: binding.authority,
    }),
  );
};
