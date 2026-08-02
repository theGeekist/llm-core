import { maybeChain, maybeMap, type MaybePromise } from "#shared/maybe";
import { verifyCompilationAuthority } from "./runtime";
import { reviewSpecificationGraph } from "./resolution";
import type { CompiledSpecification, ReviewSpecificationInput, SpecificationReview } from "./types";

export { compileSpecification } from "./compiler";

/** Native execution operations retained behind a compiled specification. */
export interface SpecificationExecutionOperations<
  TValue,
  TPrepared,
  TExecutionInput,
  TExecutionResult,
  TResumeInput,
  TResumeResult,
> {
  prepare(value: TValue): MaybePromise<TPrepared>;
  execute(input: {
    readonly prepared: TPrepared;
    readonly input: TExecutionInput;
  }): MaybePromise<TExecutionResult>;
  resume(input: {
    readonly prepared: TPrepared;
    readonly input: TResumeInput;
  }): MaybePromise<TResumeResult>;
}

/** Authority-checking execution surface returned after native preparation. */
export interface PreparedSpecificationExecution<
  TExecutionInput,
  TExecutionResult,
  TResumeInput,
  TResumeResult,
> {
  execute(input: TExecutionInput): MaybePromise<TExecutionResult>;
  resume(input: TResumeInput): MaybePromise<TResumeResult>;
}

const afterCompilationAuthority = <TValue, TResult>(
  compiled: CompiledSpecification<TValue>,
  operation: () => MaybePromise<TResult>,
): MaybePromise<TResult> => maybeChain(operation, verifyCompilationAuthority({ compiled }));

const preparedSpecificationExecution = <
  TValue,
  TPrepared,
  TExecutionInput,
  TExecutionResult,
  TResumeInput,
  TResumeResult,
>(input: {
  readonly compiled: CompiledSpecification<TValue>;
  readonly operations: SpecificationExecutionOperations<
    TValue,
    TPrepared,
    TExecutionInput,
    TExecutionResult,
    TResumeInput,
    TResumeResult
  >;
  readonly prepared: TPrepared;
}): PreparedSpecificationExecution<
  TExecutionInput,
  TExecutionResult,
  TResumeInput,
  TResumeResult
> => {
  const execute = (executionInput: TExecutionInput): MaybePromise<TExecutionResult> =>
    afterCompilationAuthority(input.compiled, () =>
      input.operations.execute({ prepared: input.prepared, input: executionInput }),
    );
  const resume = (resumeInput: TResumeInput): MaybePromise<TResumeResult> =>
    afterCompilationAuthority(input.compiled, () =>
      input.operations.resume({ prepared: input.prepared, input: resumeInput }),
    );
  return Object.freeze({ execute, resume });
};

/**
 * Keeps native preparation, execution, and resume behind current compilation
 * authority. Async preparation is revalidated before the safe facade escapes.
 */
export const prepareSpecificationExecution = <
  TValue,
  TPrepared,
  TExecutionInput,
  TExecutionResult,
  TResumeInput,
  TResumeResult,
>(input: {
  readonly compiled: CompiledSpecification<TValue>;
  readonly operations: SpecificationExecutionOperations<
    TValue,
    TPrepared,
    TExecutionInput,
    TExecutionResult,
    TResumeInput,
    TResumeResult
  >;
}): MaybePromise<
  PreparedSpecificationExecution<TExecutionInput, TExecutionResult, TResumeInput, TResumeResult>
> =>
  afterCompilationAuthority(input.compiled, () =>
    maybeChain(
      (prepared) =>
        maybeMap(
          () => preparedSpecificationExecution({ ...input, prepared }),
          verifyCompilationAuthority({ compiled: input.compiled }),
        ),
      input.operations.prepare(input.compiled.value),
    ),
  );

export const reviewSpecification = (input: ReviewSpecificationInput): SpecificationReview =>
  reviewSpecificationGraph(input.graph, input.decision);
export type {
  CompilationAuthoritySnapshot,
  CompiledSpecification,
  CompileSpecificationInput,
  SpecificationAuthorityDependencies,
  SpecificationAuthorityState,
  SpecificationAuthorityStatePort,
  SpecificationCompilationId,
  SpecificationDependencyPlan,
  SpecificationReview,
  SpecificationTargetCompiler,
  SpecificationWorkflowPlan,
  TargetNeutralCompiledPlan,
  TrustedSpecificationClock,
} from "./types";
