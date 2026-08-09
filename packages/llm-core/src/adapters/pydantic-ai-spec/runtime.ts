import type { MaybePromise } from "#shared/maybe";
import {
  prepareSpecificationExecution,
  type CompiledSpecification,
  type PreparedSpecificationExecution,
  type SpecificationExecutionOperations,
} from "@geekist/llm-core/specifications";
import type { PydanticAgentDefinition } from "./types";

/** Adapter-qualified native operations supplied by the application. */
export type PydanticAiNativeAgentOperations<
  TPrepared,
  TExecutionInput,
  TExecutionResult,
  TResumeInput,
  TResumeResult,
> = SpecificationExecutionOperations<
  PydanticAgentDefinition,
  TPrepared,
  TExecutionInput,
  TExecutionResult,
  TResumeInput,
  TResumeResult
>;

/**
 * Application-owned facade that keeps native preparation and continuation
 * inseparable from the authority-bearing compiled specification.
 */
export type PreparedPydanticAiAgentSpec<
  TExecutionInput,
  TExecutionResult,
  TResumeInput,
  TResumeResult,
> = PreparedSpecificationExecution<TExecutionInput, TExecutionResult, TResumeInput, TResumeResult>;

/**
 * Verifies immediately before native preparation, after an asynchronous
 * preparation resolves, and again before every native execute/resume call.
 * Neither the raw AgentSpec nor the native prepared value is returned.
 */
export const preparePydanticAiAgentSpec = <
  TPrepared,
  TExecutionInput,
  TExecutionResult,
  TResumeInput,
  TResumeResult,
>(input: {
  readonly compiled: CompiledSpecification<PydanticAgentDefinition>;
  readonly native: PydanticAiNativeAgentOperations<
    TPrepared,
    TExecutionInput,
    TExecutionResult,
    TResumeInput,
    TResumeResult
  >;
}): MaybePromise<
  PreparedPydanticAiAgentSpec<TExecutionInput, TExecutionResult, TResumeInput, TResumeResult>
> => prepareSpecificationExecution({ compiled: input.compiled, operations: input.native });
