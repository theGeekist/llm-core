/** Test-only proof front; never a production or package front. */
export { createLocalAgentRunner } from "./local-runner";
export { createModelToolAgentProgram } from "./model-tool-program";
export type {
  AgentRunIdentityPort,
  ControlledAgentToolExecutionPort,
  CreateLocalAgentRunnerOptions,
  DeclaredSubagentBinding,
  LocalAgentCancellationSignal,
  LocalAgentExecutionContext,
  LocalAgentExecutionPlan,
  LocalAgentExecutionResult,
  LocalAgentPreparedRequest,
  LocalAgentProgramPort,
  LocalAgentProgramResumeInput,
  LocalAgentSpecificationAuthority,
} from "./types";
export type {
  ControlledToolInputFactoryInput,
  ModelToolAgentProgramOptions,
} from "./model-tool-program";
