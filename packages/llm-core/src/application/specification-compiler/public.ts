export { compileSpecification } from "./compiler";
import { reviewSpecificationGraph } from "./resolution";
import type { ReviewSpecificationInput, SpecificationReview } from "./types";

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
