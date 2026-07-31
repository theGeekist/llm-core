import { makePipeline, type PipelineReporter, type PipelineStageState } from "@wpkernel/pipeline";
import { isPromiseLike, maybeChain, maybeMap, type MaybePromise } from "#shared/maybe";
import { deriveTargetNeutralPlan } from "./resolution";
import { captureCompilationAuthority, registerCompiledSpecification } from "./runtime";
import type {
  CompiledSpecification,
  CompileSpecificationInput,
  CompilationAuthoritySnapshot,
  TargetNeutralCompiledPlan,
} from "./types";

interface CompilerContext {
  readonly reporter: PipelineReporter;
}

interface CompilerState<T> {
  readonly input: CompileSpecificationInput<T>;
  readonly plan?: TargetNeutralCompiledPlan;
  readonly authority?: CompilationAuthoritySnapshot;
  readonly compiled?: CompiledSpecification<T>;
}

type CompilerPipelineState<T> = PipelineStageState<
  CompileSpecificationInput<T>,
  CompilerState<T>,
  CompilerContext,
  PipelineReporter,
  never
>;

const reporter: PipelineReporter = {};

const registerCompilation = <T>(input: {
  readonly state: CompilerPipelineState<T>;
  readonly plan: TargetNeutralCompiledPlan;
  readonly authority: CompilationAuthoritySnapshot;
  readonly value: T;
}): CompilerPipelineState<T> => ({
  ...input.state,
  userState: {
    ...input.state.userState,
    plan: input.plan,
    authority: input.authority,
    compiled: registerCompiledSpecification({
      accepted: input.state.userState.input.accepted,
      authority: input.authority,
      value: input.value,
    }),
  },
});

const runCompilationStage = <T>(
  state: CompilerPipelineState<T>,
): MaybePromise<CompilerPipelineState<T>> => {
  const { input } = state.userState;
  return maybeChain(
    (authority) => {
      const plan = deriveTargetNeutralPlan(input.accepted.graph, authority.acceptedScope);
      if (plan.dependency.blockedNodeIds.length > 0) {
        throw new TypeError(
          "Accepted specification scope has unresolved dependency prerequisites.",
        );
      }
      const value = input.compiler.compile({ accepted: input.accepted, plan });
      if (!isPromiseLike(value)) {
        return registerCompilation({ state, plan, authority, value });
      }
      return maybeChain(
        (resolved) =>
          maybeMap(
            (current) => registerCompilation({ state, plan, authority: current, value: resolved }),
            captureCompilationAuthority(input.accepted, input.authority),
          ),
        value,
      );
    },
    captureCompilationAuthority(input.accepted, input.authority),
  );
};

/** Creates a fresh, run-local Pipeline for every compilation invocation. */
export const compileSpecification = <T>(
  input: CompileSpecificationInput<T>,
): MaybePromise<CompiledSpecification<T>> => {
  const pipeline = makePipeline<
    CompileSpecificationInput<T>,
    CompilerContext,
    PipelineReporter,
    CompilerState<T>,
    never,
    CompiledSpecification<T>,
    never
  >({
    helperKinds: [],
    createContext: () => ({ reporter }),
    createState: ({ options }) => ({ input: options }),
    createStages: (dependencies) => [
      (state) => runCompilationStage(state),
      dependencies.finalizeResult,
    ],
    createRunResult: ({ artifact }) => {
      if (artifact.compiled === undefined) {
        throw new TypeError("Specification compiler did not produce a compiled value.");
      }
      return artifact.compiled;
    },
  });
  return pipeline.run(input);
};
