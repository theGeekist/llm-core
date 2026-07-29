import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  coreId,
  type ConversationId,
  type EventId,
  type InvocationId,
  type RunId,
  type ToolCallId,
} from "#contracts";
import {
  createLocalAgentRunner,
  createModelToolAgentProgram,
} from "../../../src/application/agent/public";
import type { Model, ModelRequest } from "../../../src/features/model/public";
import type { AgentRunner, PreparedAgentSpec } from "../../../src/features/agent/public";
import type { ConversationStore, ConversationTurn } from "../../../src/features/memory/public";
import type {
  ControlledToolExecutionOutcome,
  ExecuteControlledToolInput,
} from "../../../src/application/tool-execution/public";
import type { ToolBinding, ToolCall, ToolId } from "../../../src/features/tooling/public";

const RUN_ID = coreId<RunId>("00000000-0000-4000-8000-000000000001");
const INVOCATION_ID = coreId<InvocationId>("00000000-0000-4000-8000-000000000002");
const TOOL_CALL_ID = coreId<ToolCallId>("00000000-0000-4000-8000-000000000003");
const CONVERSATION_ID = coreId<ConversationId>("00000000-0000-4000-8000-000000000004");

const model = (generate: Model["generate"]): Model => ({
  profile: {} as Model["profile"],
  generate,
});

const binding = (
  effect: ToolBinding["spec"]["effect"]["class"],
  execute: ToolBinding["execute"],
): ToolBinding =>
  ({
    spec: {
      id: "lookup" as ToolId,
      version: contractVersion("1.0.0"),
      description: "Lookup a value",
      inputSchema: { document: { type: "object" } },
      effect: { class: effect, targets: [] },
      execution: {
        concurrency: "shared",
        cancellation: "unsupported",
        idempotency: "not-supported",
        retryAfterStart: "never",
      },
    },
    validate: (call: ToolCall) => call,
    execute,
  }) as unknown as ToolBinding;

const runnerWith = (
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
        coreId<EventId>(`00000000-0000-4000-8000-${String(event++).padStart(12, "0")}`),
      now: () => "2026-07-30T00:00:00.000Z",
    },
    program,
    ...(controlledToolExecution ? { controlledToolExecution } : {}),
  });
};

const request = (agent: PreparedAgentSpec, input: unknown = { question: "hello" }) => ({
  agent,
  invocationContext: { invocationId: INVOCATION_ID },
  input: input as never,
});

const prepare = async (
  runner: AgentRunner,
  instructions: string,
  agentId = "agent",
): Promise<PreparedAgentSpec> =>
  runner.prepare({
    agentId,
    version: contractVersion("1.0.0"),
    instructions,
    effectRequirement: "read-only",
  });

const run = async (runner: AgentRunner, agent: PreparedAgentSpec) =>
  (await runner.start(request(agent))).result();

describe("model/tool agent program", () => {
  test("makes createLocalAgentRunner a complete synchronous model loop", async () => {
    let observed: ModelRequest | undefined;
    const program = createModelToolAgentProgram({
      model: model((input) => {
        observed = input;
        return {
          kind: "completion",
          content: [{ kind: "text", text: "done" }],
          finishReason: "stop",
        };
      }),
    });
    const runner = runnerWith(program);
    const agent = await prepare(runner, "Be precise.");
    const started = await runner.start(request(agent));
    const result = started.result();

    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toMatchObject({ status: "completed", output: "done" });
    expect(observed?.messages).toEqual([
      { role: "system", content: [{ kind: "text", text: "Be precise." }] },
      { role: "user", content: [{ kind: "json", value: { question: "hello" } }] },
    ]);
  });

  test("executes validated read-only tools and feeds results back to the model", async () => {
    const requests: ModelRequest[] = [];
    const calls: ToolCall[] = [];
    const tool = binding("read-only", (call) => {
      calls.push(call);
      return {
        toolCallId: call.toolCallId,
        status: "succeeded",
        content: [{ kind: "text", text: "42" }],
      };
    });
    const program = createModelToolAgentProgram({
      tools: [tool],
      model: model((input) => {
        requests.push(structuredClone(input));
        return requests.length === 1
          ? {
              kind: "completion",
              content: [
                {
                  kind: "tool-call",
                  toolCallId: TOOL_CALL_ID,
                  name: "lookup",
                  arguments: { key: "answer" },
                },
              ],
              finishReason: "tool-calls",
            }
          : {
              kind: "completion",
              content: [{ kind: "text", text: "The answer is 42." }],
              finishReason: "stop",
            };
      }),
    });
    const runner = runnerWith(program);
    const agent = await prepare(runner, "Use tools.");

    expect(await run(runner, agent)).toMatchObject({
      status: "completed",
      output: "The answer is 42.",
    });
    expect(calls).toHaveLength(1);
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: "tool",
      content: [
        {
          kind: "tool-result",
          toolCallId: TOOL_CALL_ID,
          result: [{ kind: "text", text: "42" }],
        },
      ],
    });
  });

  test("fails meaningful effects closed when no controlled path is composed", async () => {
    let directExecutions = 0;
    let modelCalls = 0;
    const tool = binding("external-write", (call) => {
      directExecutions += 1;
      return { toolCallId: call.toolCallId, status: "succeeded", content: [] };
    });
    const program = createModelToolAgentProgram({
      tools: [tool],
      model: model(() => {
        modelCalls += 1;
        return modelCalls === 1
          ? {
              kind: "completion",
              content: [
                {
                  kind: "tool-call",
                  toolCallId: TOOL_CALL_ID,
                  name: "lookup",
                  arguments: {},
                },
              ],
              finishReason: "tool-calls",
            }
          : {
              kind: "completion",
              content: [{ kind: "text", text: "not executed" }],
              finishReason: "stop",
            };
      }),
    });
    const runner = runnerWith(program);
    const agent = await prepare(runner, "Never bypass control.");

    expect(await run(runner, agent)).toMatchObject({
      status: "completed",
      output: "not executed",
    });
    expect(directExecutions).toBe(0);
  });

  test("routes meaningful effects only through the composed controlled port", async () => {
    let controlledExecutions = 0;
    let modelCalls = 0;
    const tool = binding("external-write", () => {
      throw new Error("direct execution must remain unreachable");
    });
    const program = createModelToolAgentProgram({
      tools: [tool],
      controlledToolInput: (_binding, call) => ({ call }) as unknown as ExecuteControlledToolInput,
      model: model(() => {
        modelCalls += 1;
        return modelCalls === 1
          ? {
              kind: "completion",
              content: [
                {
                  kind: "tool-call",
                  toolCallId: TOOL_CALL_ID,
                  name: "lookup",
                  arguments: { write: true },
                },
              ],
              finishReason: "tool-calls",
            }
          : {
              kind: "completion",
              content: [{ kind: "text", text: "controlled" }],
              finishReason: "stop",
            };
      }),
    });
    const runner = runnerWith(program, {
      execute: (input) => {
        controlledExecutions += 1;
        return {
          status: "succeeded",
          result: {
            toolCallId: input.call.toolCallId,
            status: "succeeded",
            content: [{ kind: "text", text: "written" }],
          },
          receipt: {} as never,
          eventDelivery: "scheduled",
        };
      },
    });
    const agent = await runner.prepare({
      agentId: "agent",
      version: contractVersion("1.0.0"),
      instructions: "Use controlled effects.",
      effectRequirement: "controlled",
    });

    expect(await run(runner, agent)).toMatchObject({
      status: "completed",
      output: "controlled",
    });
    expect(controlledExecutions).toBe(1);
  });

  test("preserves child-run identity and result semantics for configured subagents", async () => {
    const subagents: Record<string, PreparedAgentSpec> = {};
    const seenInstructions: string[] = [];
    const program = createModelToolAgentProgram({
      subagents,
      model: model((input) => {
        const instruction = (input.messages[0]?.content[0] as { text: string }).text;
        seenInstructions.push(instruction);
        if (
          instruction === "Delegate." &&
          seenInstructions.filter((v) => v === "Delegate.").length === 1
        ) {
          return {
            kind: "completion",
            content: [
              {
                kind: "tool-call",
                toolCallId: TOOL_CALL_ID,
                name: "researcher",
                arguments: { topic: "core" },
              },
            ],
            finishReason: "tool-calls",
          };
        }
        return {
          kind: "completion",
          content: [{ kind: "text", text: instruction === "Research." ? "facts" : "final" }],
          finishReason: "stop",
        };
      }),
    });
    const runner = runnerWith(program);
    const parent = await prepare(runner, "Delegate.", "parent");
    subagents.researcher = await prepare(runner, "Research.", "researcher");

    expect(await run(runner, parent)).toMatchObject({
      status: "completed",
      output: "final",
    });
    expect(seenInstructions).toEqual(["Delegate.", "Research.", "Delegate."]);
  });

  test("honours the invocation model-call budget", async () => {
    const program = createModelToolAgentProgram({
      model: model(() => ({
        kind: "completion",
        content: [
          {
            kind: "tool-call",
            toolCallId: TOOL_CALL_ID,
            name: "missing",
            arguments: {},
          },
        ],
        finishReason: "tool-calls",
      })),
    });
    const runner = runnerWith(program);
    const agent = await prepare(runner, "Bounded.");
    const started = await runner.start({
      ...request(agent),
      invocationContext: {
        invocationId: INVOCATION_ID,
        budget: { maxModelCalls: 1 },
      },
    });
    const result = await started.result();

    expect(result).toMatchObject({
      status: "failed",
      reasonCode: "model-call-limit-exceeded",
    });
  });

  test("loads and appends portable conversation turns around the model loop", async () => {
    const appended: ConversationTurn[] = [];
    let observed: ModelRequest | undefined;
    const conversation: ConversationStore = {
      read: () => ({
        conversationId: CONVERSATION_ID,
        revision: 1,
        turns: [
          {
            role: "assistant",
            content: [{ kind: "text", text: "previous answer" }],
          },
        ],
      }),
      append: (_context, _conversationId, turn) => {
        appended.push(turn);
        return true;
      },
      reset: () => true,
    };
    const program = createModelToolAgentProgram({
      conversation,
      model: model((input) => {
        observed = input;
        return {
          kind: "completion",
          content: [{ kind: "text", text: "next answer" }],
          finishReason: "stop",
        };
      }),
    });
    const runner = runnerWith(program);
    const agent = await prepare(runner, "Remember.");
    const started = await runner.start({
      ...request(agent),
      invocationContext: {
        invocationId: INVOCATION_ID,
        conversationId: CONVERSATION_ID,
      },
    });

    expect(await started.result()).toMatchObject({
      status: "completed",
      output: "next answer",
    });
    expect(observed?.messages[1]).toEqual({
      role: "assistant",
      content: [{ kind: "text", text: "previous answer" }],
    });
    expect(appended).toEqual([
      { role: "user", content: [{ kind: "json", value: { question: "hello" } }] },
      { role: "assistant", content: [{ kind: "text", text: "next answer" }] },
    ]);
  });
});
