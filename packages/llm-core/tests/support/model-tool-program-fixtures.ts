import {
  contractVersion,
  coreId,
  digest,
  type ConversationId,
  type EventId,
  type InvocationId,
  type RunId,
  type ToolCallId,
} from "#contracts";
import type {
  ControlledToolExecutionOutcome,
  ExecuteControlledToolInput,
} from "../../src/application/tool-execution/public";
import type { AgentRunner, PreparedAgentDefinition } from "../../src/features/agent/public";
import type { Model } from "../../src/features/model/public";
import {
  createExecutableTool,
  registerToolSchema,
  toolId,
  type ExecutableTool,
} from "../../src/features/tooling/runtime";
import {
  createLocalAgentRunner,
  type createModelToolAgentProgram,
  type DeclaredSubagentBinding,
} from "./local-agent/public";

export const RUN_ID = coreId<RunId>("00000000-0000-7000-8000-000000000001");
export const INVOCATION_ID = coreId<InvocationId>("00000000-0000-4000-8000-000000000002");
export const TOOL_CALL_ID = coreId<ToolCallId>("00000000-0000-4000-8000-000000000003");
export const CONVERSATION_ID = coreId<ConversationId>("00000000-0000-4000-8000-000000000004");
export const TOOL_INPUT_SCHEMA = await registerToolSchema(
  { type: "object" },
  { digest: () => digest("0".repeat(64)) },
);

export const model = (generate: Model["generate"]): Model => ({
  profile: {} as Model["profile"],
  generate,
});

export const binding = (
  effect: ExecutableTool["definition"]["effect"]["class"],
  execute: ExecutableTool["execute"],
): ExecutableTool =>
  createExecutableTool({
    definition: {
      id: toolId("test.lookup"),
      version: contractVersion("1.0.0"),
      description: "Lookup a value",
      inputSchema: TOOL_INPUT_SCHEMA,
      effect: {
        class: effect,
        targets: effect === "read-only" ? [] : [{ kind: "service", id: "test-service" }],
      },
      execution: {
        concurrency: "shared",
        cancellation: "unsupported",
        idempotency: "not-supported",
        retryAfterStart: "never",
      },
    },
    argumentValidator: { validate: () => ({ valid: true }) },
    execute,
  });

export const runnerWith = (
  program: ReturnType<typeof createModelToolAgentProgram>,
  controlledToolExecution?: {
    execute(input: ExecuteControlledToolInput): ControlledToolExecutionOutcome;
  },
) => {
  let event = 10;
  return createLocalAgentRunner({
    runnerId: "test-runner",
    runnerVersion: contractVersion("1.0.0"),
    identity: {
      newRunId: () => RUN_ID,
      newEventId: () =>
        coreId<EventId>(`00000000-0000-7000-8000-${String(event++).padStart(12, "0")}`),
      now: () => "2026-07-30T00:00:00.000Z",
    },
    program,
    ...(controlledToolExecution ? { controlledToolExecution } : {}),
  });
};

export const request = (
  agent: PreparedAgentDefinition,
  input: unknown = { question: "hello" },
) => ({
  agent,
  invocationContext: { invocationId: INVOCATION_ID },
  input: input as never,
});

export const prepare = async (
  runner: AgentRunner,
  instructions: string,
  agentId = "agent",
): Promise<PreparedAgentDefinition> =>
  runner.prepare({
    agentId,
    version: contractVersion("1.0.0"),
    instructions,
    effectRequirement: "read-only",
  });

export const declaredSubagent = (
  resolve: DeclaredSubagentBinding["resolve"],
  declaration: DeclaredSubagentBinding["declaration"] = {
    name: "researcher",
    description: "Delegate focused research.",
    parameters: { type: "object" },
  },
): DeclaredSubagentBinding => ({
  declaration,
  agentId: "researcher",
  agentVersion: contractVersion("1.0.0"),
  resolve,
});

export const run = async (
  runner: AgentRunner,
  agent: PreparedAgentDefinition,
  invocationContext?: ReturnType<typeof request>["invocationContext"] & {
    conversationId?: ConversationId;
  },
) =>
  (
    await runner.start({
      ...request(agent),
      ...(invocationContext ? { invocationContext } : {}),
    })
  ).result();
