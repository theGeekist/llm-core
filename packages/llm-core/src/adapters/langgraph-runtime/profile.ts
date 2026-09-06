import { contractVersion } from "#contracts";
import type { AgentRunnerProfile } from "../../features/agent/public";
import type { RuntimeContractReference, RuntimeOperationDeclaration } from "../runtimes/public";

export const LANGGRAPH_RUNTIME_VERSION = "1.0.7";

export const langGraphRuntimeSourceContract = Object.freeze({
  authority: "@langchain/langgraph",
  version: LANGGRAPH_RUNTIME_VERSION,
  revision: "npm:@langchain/langgraph@1.0.7",
});

export const langGraphRuntimeProfile: AgentRunnerProfile = Object.freeze({
  runnerId: "llm-core.langgraph.runtime",
  runnerVersion: contractVersion(LANGGRAPH_RUNTIME_VERSION),
  controlledEffects: false,
  cancellation: "cooperative",
  interventions: false,
  checkpointResume: false,
  providerSessionContinuation: false,
  durableExecutionSignalling: false,
  childRuns: false,
});

const portableContract: RuntimeContractReference = Object.freeze({
  authority: "@geekist/llm-core AgentRunner",
  version: "2",
  source: "packages/llm-core/src/features/agent/public.ts",
});

const nativeContract: RuntimeContractReference = Object.freeze({
  authority: "@langchain/langgraph",
  version: LANGGRAPH_RUNTIME_VERSION,
  source: langGraphRuntimeSourceContract.revision,
});

const adapterContract: RuntimeContractReference = Object.freeze({
  authority: "@geekist/llm-core LangGraph adapter",
  version: LANGGRAPH_RUNTIME_VERSION,
  source: "packages/llm-core/src/adapters/langgraph-runtime/public.ts",
});

const runnerFixture = "packages/llm-core/tests/adapters/langgraph-runtime/runner.test.ts";
const rejectionFixture = runnerFixture;
const exactFixture = "apps/langgraph-runtime-qualification/qualification.test.ts";

const declarations: readonly RuntimeOperationDeclaration[] = [
  {
    area: "model",
    operation: "portable.agent.prepare.read-only-definition",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "supported",
    fixtures: [runnerFixture],
    detail: "Closed read-only AgentDefinition values are prepared by this runner.",
  },
  {
    area: "model",
    operation: "portable.agent.start.langgraph-adapter-state-output",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "supported",
    fixtures: [runnerFixture],
    detail: "The injected graph accepts LangGraphAdapterState and returns its closed output field.",
  },
  {
    area: "event",
    operation: "portable.agent.observe.normalized-lifecycle",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "supported",
    fixtures: [runnerFixture],
    detail: "Started, cancellation and terminal events remain live, ordered and closed.",
  },
  {
    area: "control",
    operation: "portable.agent.cancel.cooperative",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "supported",
    fixtures: [runnerFixture, exactFixture],
    detail: "Cancellation emits portable control evidence and propagates an AbortSignal.",
  },
  {
    area: "control",
    operation: "portable.agent.intervene",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "unsupported",
    fixtures: [rejectionFixture],
    detail: "Native LangGraph interrupts are not authenticated portable interventions.",
  },
  {
    area: "state",
    operation: "portable.agent.resume.checkpoint",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "unsupported",
    fixtures: [rejectionFixture],
    detail: "LangGraph checkpoints are not portable llm-core checkpoints.",
  },
  {
    area: "continuation",
    operation: "portable.agent.continue.provider-session",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "unsupported",
    fixtures: [rejectionFixture],
    detail: "A LangGraph thread is not a portable provider session.",
  },
  {
    area: "state",
    operation: "native.langgraph.graph.reducer-checkpoint-thread",
    surface: "native",
    owner: "@langchain/langgraph",
    contract: nativeContract,
    disposition: "supported",
    fixtures: [exactFixture],
    detail: "Exact fixtures retain reducers, MemorySaver checkpoints and independent threads.",
  },
  {
    area: "continuation",
    operation: "native.langgraph.interrupt-command-resume",
    surface: "native",
    owner: "@langchain/langgraph",
    contract: nativeContract,
    disposition: "supported",
    fixtures: [exactFixture],
    detail: "Interrupt and Command resume remain direct LangGraph operations on one thread.",
  },
  {
    area: "event",
    operation: "native.langgraph.adapter.state-summary-projection",
    surface: "native",
    owner: "@geekist/llm-core",
    contract: adapterContract,
    disposition: "supported",
    fixtures: [runnerFixture, exactFixture],
    detail: "Checkpoint state is projected separately when the injected graph has a checkpointer.",
  },
  {
    area: "event",
    operation: "native.langgraph.adapter.error-summary-projection",
    surface: "native",
    owner: "@geekist/llm-core",
    contract: adapterContract,
    disposition: "supported",
    fixtures: [runnerFixture],
    detail: "Invocation rejection, abort and unavailable state retain distinct native error facts.",
  },
  {
    area: "state",
    operation: "native.langgraph.raw-state-snapshot",
    surface: "native",
    owner: "@langchain/langgraph",
    contract: nativeContract,
    disposition: "unsupported",
    fixtures: [rejectionFixture],
    detail:
      "The adapter does not expose raw state values, metadata, tasks or checkpoint relationships.",
  },
  {
    area: "event",
    operation: "native.langgraph.raw-error-object",
    surface: "native",
    owner: "@langchain/langgraph",
    contract: nativeContract,
    disposition: "unsupported",
    fixtures: [rejectionFixture],
    detail: "The adapter exposes closed error summaries rather than native exception objects.",
  },
  {
    area: "event",
    operation: "native.langgraph.event-stream",
    surface: "native",
    owner: "@langchain/langgraph",
    contract: nativeContract,
    disposition: "unsupported",
    fixtures: [rejectionFixture],
    detail: "The assessed adapter does not expose LangGraph native event streaming.",
  },
];

export interface LangGraphRuntimeOperationMatrix {
  readonly adapterId: "llm-core.runtime.langgraph";
  readonly assessedRelease: "1.0.7";
  readonly assessedSource: "npm:@langchain/langgraph@1.0.7";
  readonly supportedReleaseRange: "==1.0.7";
  readonly conformanceEvidence: "local-exact-runtime-operation-fixtures";
  readonly operations: readonly RuntimeOperationDeclaration[];
}

export const langGraphRuntimeOperations: LangGraphRuntimeOperationMatrix = Object.freeze({
  adapterId: "llm-core.runtime.langgraph",
  assessedRelease: LANGGRAPH_RUNTIME_VERSION,
  assessedSource: langGraphRuntimeSourceContract.revision,
  supportedReleaseRange: "==1.0.7",
  conformanceEvidence: "local-exact-runtime-operation-fixtures",
  operations: Object.freeze(
    declarations.map(
      (operation) =>
        Object.freeze({
          ...operation,
          fixtures: Object.freeze([...operation.fixtures]),
        }) as RuntimeOperationDeclaration,
    ),
  ),
});
