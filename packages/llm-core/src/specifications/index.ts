import type { ContractVersion, Digest } from "#contracts";
import { maybeChain, maybeMap, type MaybePromise } from "#shared/maybe";
import {
  createSpecificationGraph,
  createSpecificationSourceSnapshot,
} from "../features/specifications/factory";
import type { SpecificationAuthorityState } from "../application/specification-compiler/types";
import {
  bindCompiledSpecificationAuthority,
  registerAcceptedSpecification,
} from "../application/specification-compiler/runtime";
import { compileSpecification as compileRegisteredSpecification } from "../application/specification-compiler/compiler";
import { reviewSpecificationGraph } from "../application/specification-compiler/resolution";
import {
  createConversionReport,
  createProposedSpecificationChange,
  createSpecificationAdapterSupport,
  createSpecificationDecision,
  createSpecificationDecisionRecord,
  createSpecificationSourceSnapshot as createSourceSnapshot,
} from "../features/specifications/public";
import type {
  ConversionFidelity,
  ConversionIssue,
  ConversionIssueDisposition,
  ConversionIssueSeverity,
  ConversionReport,
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
  SpecificationEvidenceBinding,
  SpecificationFormat,
  SpecificationPolicyVersion,
  SpecificationQuestion,
  SpecificationSourceAuthority,
  SpecificationSourceBinding,
  SpecificationSourceDocument,
  SpecificationSourceId,
  SpecificationSourceRevisionBinding,
  SpecificationSourceRole,
  SpecificationSourceSnapshot,
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
  createSourceSnapshot as createSpecificationSourceSnapshot,
};
export type {
  CompiledSpecification,
  ConversionFidelity,
  ConversionIssue,
  ConversionIssueDisposition,
  ConversionIssueSeverity,
  ConversionReport,
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
  SpecificationEvidenceBinding,
  SpecificationFormat,
  SpecificationPolicyVersion,
  SpecificationQuestion,
  SpecificationSourceAuthority,
  SpecificationSourceBinding,
  SpecificationSourceDocument,
  SpecificationSourceId,
  SpecificationSourceRevisionBinding,
  SpecificationSourceRole,
  SpecificationSourceSnapshot,
};

/**
 * A loaded portable specification. Its reconciled graph stays private so
 * callers cannot bypass review by reconstructing compiler state.
 */
export interface Specification {
  readonly sources: readonly SpecificationSourceSnapshot[];
  readonly report?: ConversionReport;
}

/** The current state a review policy attests before acceptance or compilation. */
export interface SpecificationPolicyCurrentState {
  readonly authority: string;
  readonly resolvedDigest: Digest;
  readonly acceptedScope: readonly string[];
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
  /** A portable declarative target, such as the common Agent ExecutionPlan. */
  readonly target: T;
}

interface ReviewBinding {
  readonly graph: ReturnType<typeof createSpecificationGraph>;
  readonly authority: SpecificationAuthorityDependencies;
}

const loadedGraphs = new WeakMap<Specification, ReturnType<typeof createSpecificationGraph>>();
const reviewBindings = new WeakMap<SpecificationDecision, ReviewBinding>();

const graphFor = (specification: Specification): ReturnType<typeof createSpecificationGraph> => {
  const graph = loadedGraphs.get(specification);
  if (graph === undefined) {
    throw new TypeError("Specifications must be loaded by loadSpecification before review.");
  }
  return graph;
};

const graphFromSource = (input: unknown): ReturnType<typeof createSpecificationGraph> => {
  try {
    return createSpecificationGraph(input as never);
  } catch (graphError) {
    try {
      const source = createSpecificationSourceSnapshot(input as never);
      return createSpecificationGraph({
        graphId: `${source.sourceId}.loaded` as never,
        version: source.format.version,
        sources: [source],
        nodes: [],
        relationships: [],
      });
    } catch {
      throw graphError;
    }
  }
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
  readonly authority?: SpecificationAuthorityDependencies;
}): MaybePromise<SpecificationDecision> => {
  const reviewed = reviewSpecificationGraph(input.graph, input.decision).decision;
  if (reviewed.status !== "accepted") return reviewed;
  if (input.authority === undefined) {
    throw new TypeError("Accepted specification decisions require a review policy.");
  }
  return maybeMap(
    () => {
      reviewBindings.set(reviewed, { graph: input.graph, authority: input.authority! });
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
  if (options.policy === undefined) {
    return recordDecision({
      decision: reviewSpecificationGraph(graph).decision,
      graph,
    });
  }
  const authority = policyAuthority(options.policy, specification);
  return maybeChain(
    (decision) => recordDecision({ decision, graph, authority }),
    options.policy.decide({ specification, evidence: options.evidence ?? [] }),
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
