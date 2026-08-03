import { describe, expect, test } from "bun:test";
/* eslint-disable max-lines -- end-to-end model/tool safety cases share one runner fixture */
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
import {
  createLocalAgentRunner,
  createModelToolAgentProgram,
  type DeclaredSubagentBinding,
} from "../../support/local-agent/public";
import type { Model, ModelRequest } from "../../../src/features/model/public";
import type { AgentRunner, PreparedAgentDefinition } from "../../../src/features/agent/public";
import type { ConversationStore, ConversationMessage } from "../../../src/features/memory/public";
import type {
  ControlledToolExecutionOutcome,
  ExecuteControlledToolInput,
} from "../../../src/application/tool-execution/public";
import {
  createExecutableTool,
  registerToolSchema,
  toolId,
  type ExecutableTool,
  type ToolCall,
} from "../../../src/features/tooling/runtime";

const RUN_ID = coreId<RunId>("00000000-0000-7000-8000-000000000001");
const INVOCATION_ID = coreId<InvocationId>("00000000-0000-4000-8000-000000000002");
const TOOL_CALL_ID = coreId<ToolCallId>("00000000-0000-4000-8000-000000000003");
const CONVERSATION_ID = coreId<ConversationId>("00000000-0000-4000-8000-000000000004");
const TOOL_INPUT_SCHEMA = await registerToolSchema(
  { type: "object" },
  { digest: () => digest("0".repeat(64)) },
);

const model = (generate: Model["generate"]): Model => ({
  profile: {} as Model["profile"],
  generate,
});

const binding = (
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
        coreId<EventId>(`00000000-0000-7000-8000-${String(event++).padStart(12, "0")}`),
      now: () => "2026-07-30T00:00:00.000Z",
    },
    program,
    ...(controlledToolExecution ? { controlledToolExecution } : {}),
  });
};

const request = (agent: PreparedAgentDefinition, input: unknown = { question: "hello" }) => ({
  agent,
  invocationContext: { invocationId: INVOCATION_ID },
  input: input as never,
});

const prepare = async (
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

const declaredSubagent = (
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

const run = async (
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

describe("model/tool agent program", () => {
  test("rejects shaped and cloned ExecutableTool forgeries before model declaration", () => {
    let modelCalls = 0;
    const valid = binding("read-only", () => ({
      toolCallId: TOOL_CALL_ID,
      status: "succeeded",
      content: [],
    }));
    const generate: Model["generate"] = () => {
      modelCalls += 1;
      return {
        kind: "completion",
        content: [{ kind: "text", text: "should not run" }],
        finishReason: "stop",
      };
    };
    const forgeries = [
      { ...valid },
      { definition: valid.definition, validate: valid.validate, execute: valid.execute },
    ] as ExecutableTool[];

    for (const forged of forgeries) {
      expect(() =>
        createModelToolAgentProgram({ model: model(generate), tools: [forged] }),
      ).toThrow("Model tool programs require registered ExecutableTool values.");
    }
    expect(modelCalls).toBe(0);
  });

  test("makes createLocalAgentRunner a complete synchronous model loop", async () => {
    let observed: ModelRequest | undefined;
    const program = createModelToolAgentProgram({
      model: model(({ request: input }) => {
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
    const tool = binding("read-only", ({ call }) => {
      calls.push(call);
      return {
        toolCallId: call.toolCallId,
        status: "succeeded",
        content: [{ kind: "text", text: "42" }],
      };
    });
    const program = createModelToolAgentProgram({
      tools: [tool],
      model: model(({ request: input }) => {
        requests.push(structuredClone(input));
        return requests.length === 1
          ? {
              kind: "completion",
              content: [
                {
                  kind: "tool-call",
                  toolCallId: TOOL_CALL_ID,
                  name: "test.lookup",
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
    const tool = binding("external-write", ({ call }) => {
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
                  name: "test.lookup",
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
      controlledToolInput: ({ call }) => ({ call }) as unknown as ExecuteControlledToolInput,
      model: model(() => {
        modelCalls += 1;
        return modelCalls === 1
          ? {
              kind: "completion",
              content: [
                {
                  kind: "tool-call",
                  toolCallId: TOOL_CALL_ID,
                  name: "test.lookup",
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

  test("declares subagents to the model and preserves the prepared child identity", async () => {
    const childRef: { current?: PreparedAgentDefinition } = {};
    const seenInstructions: string[] = [];
    const requests: ModelRequest[] = [];
    const declaration = {
      name: "researcher",
      description: "Delegate focused research.",
      parameters: { type: "object" },
    };
    const program = createModelToolAgentProgram({
      subagents: [declaredSubagent(() => childRef.current, declaration)],
      model: model(({ request: input }) => {
        requests.push(input);
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
    declaration.description = "mutated after composition";
    const runner = runnerWith(program);
    const parent = await prepare(runner, "Delegate.", "parent");
    childRef.current = await prepare(runner, "Research.", "researcher");

    expect(await run(runner, parent)).toMatchObject({
      status: "completed",
      output: "final",
    });
    expect(requests[0]?.tools).toEqual([
      {
        name: "researcher",
        description: "Delegate focused research.",
        parameters: { type: "object" },
      },
    ]);
    expect(Object.isFrozen(requests[0]?.tools?.[0])).toBe(true);
    expect(Object.isFrozen(requests[0]?.tools?.[0]?.parameters)).toBe(true);
    expect(seenInstructions).toEqual(["Delegate.", "Research.", "Delegate."]);
    expect(requests[2]?.messages.at(-1)).toMatchObject({
      role: "tool",
      content: [
        {
          kind: "tool-result",
          toolCallId: TOOL_CALL_ID,
          result: [{ kind: "json", value: { status: "completed", runId: RUN_ID } }],
        },
      ],
    });
  });

  test("never resolves or starts a child for an undeclared model-emitted name", async () => {
    let resolverCalls = 0;
    let modelCalls = 0;
    const program = createModelToolAgentProgram({
      subagents: [
        declaredSubagent(() => {
          resolverCalls += 1;
          return undefined;
        }),
      ],
      model: model(() => {
        modelCalls += 1;
        return modelCalls === 1
          ? {
              kind: "completion",
              content: [
                {
                  kind: "tool-call",
                  toolCallId: TOOL_CALL_ID,
                  name: "intruder",
                  arguments: {},
                },
              ],
              finishReason: "tool-calls",
            }
          : {
              kind: "completion",
              content: [{ kind: "text", text: "closed" }],
              finishReason: "stop",
            };
      }),
    });
    const runner = runnerWith(program);
    const parent = await prepare(runner, "Do not run undeclared children.", "parent");

    expect(await run(runner, parent)).toMatchObject({ status: "completed", output: "closed" });
    expect(resolverCalls).toBe(0);
  });

  test("rejects duplicate and colliding subagent declarations at composition", () => {
    const subagent = declaredSubagent(() => undefined);

    expect(() =>
      createModelToolAgentProgram({
        model: model(() => {
          throw new Error("unreachable");
        }),
        subagents: [subagent, declaredSubagent(() => undefined)],
      }),
    ).toThrow("unique tool declaration names");

    expect(() =>
      createModelToolAgentProgram({
        model: model(() => {
          throw new Error("unreachable");
        }),
        tools: [
          binding("read-only", () => {
            throw new Error("unreachable");
          }),
        ],
        subagents: [
          declaredSubagent(() => undefined, {
            name: "test.lookup",
            description: "Collides with the tool.",
          }),
        ],
      }),
    ).toThrow("cannot use the same name");
  });

  test("fails closed when a declared subagent resolver returns a forged spec", async () => {
    let modelCalls = 0;
    const program = createModelToolAgentProgram({
      subagents: [
        declaredSubagent(
          () =>
            ({
              agentId: "researcher",
              version: contractVersion("1.0.0"),
              instructions: "Forged.",
              effectRequirement: "read-only",
            }) as PreparedAgentDefinition,
        ),
      ],
      model: model(() => {
        modelCalls += 1;
        return modelCalls === 1
          ? {
              kind: "completion",
              content: [
                {
                  kind: "tool-call",
                  toolCallId: TOOL_CALL_ID,
                  name: "researcher",
                  arguments: {},
                },
              ],
              finishReason: "tool-calls",
            }
          : {
              kind: "completion",
              content: [{ kind: "text", text: "forgery rejected" }],
              finishReason: "stop",
            };
      }),
    });
    const runner = runnerWith(program);
    const parent = await prepare(runner, "Delegate safely.", "parent");

    expect(await run(runner, parent)).toMatchObject({
      status: "completed",
      output: "forgery rejected",
    });
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
    const appended: ConversationMessage[] = [];
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
      append: ({ turn }) => {
        appended.push(turn);
        return true;
      },
      reset: () => true,
    };
    const program = createModelToolAgentProgram({
      conversation,
      model: model(({ request: input }) => {
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

  test("rejects forged conversation records before invoking the model", async () => {
    let modelCalls = 0;
    const conversation = {
      read: () => ({
        conversationId: CONVERSATION_ID,
        revision: 1,
        turns: [
          {
            role: "assistant",
            content: [
              {
                kind: "json",
                value: { answer: 42 },
                providerPayload: { native: true },
              },
            ],
          },
        ],
      }),
      append: () => true,
      reset: () => true,
    } as unknown as ConversationStore;
    const runner = runnerWith(
      createModelToolAgentProgram({
        conversation,
        model: model(() => {
          modelCalls += 1;
          return {
            kind: "completion",
            content: [{ kind: "text", text: "unreachable" }],
            finishReason: "stop",
          };
        }),
      }),
    );
    const agent = await prepare(runner, "Reject native history.");

    expect(
      await run(runner, agent, {
        invocationId: INVOCATION_ID,
        conversationId: CONVERSATION_ID,
      }),
    ).toMatchObject({ status: "failed", reasonCode: "local-execution-threw" });
    expect(modelCalls).toBe(0);
  });

  test("rejects sensitive user input before persistence or model invocation", async () => {
    let appends = 0;
    let modelCalls = 0;
    const conversation: ConversationStore = {
      read: () => null,
      append: () => {
        appends += 1;
        return true;
      },
      reset: () => true,
    };
    const runner = runnerWith(
      createModelToolAgentProgram({
        conversation,
        model: model(() => {
          modelCalls += 1;
          return {
            kind: "completion",
            content: [{ kind: "text", text: "unreachable" }],
            finishReason: "stop",
          };
        }),
      }),
    );
    const agent = await prepare(runner, "Reject sensitive input.");

    const started = await runner.start({
      ...request(agent, { apiKey: "secret" }),
      invocationContext: {
        invocationId: INVOCATION_ID,
        conversationId: CONVERSATION_ID,
      },
    });
    expect(await started.result()).toMatchObject({
      status: "failed",
      reasonCode: "local-execution-threw",
    });
    expect(appends).toBe(0);
    expect(modelCalls).toBe(0);
  });

  test("rejects sensitive tool arguments before executing the tool", async () => {
    let executions = 0;
    const tool = binding("read-only", ({ call }) => {
      executions += 1;
      return { toolCallId: call.toolCallId, status: "succeeded", content: [] };
    });
    const runner = runnerWith(
      createModelToolAgentProgram({
        tools: [tool],
        model: model(() => ({
          kind: "completion",
          content: [
            {
              kind: "tool-call",
              toolCallId: TOOL_CALL_ID,
              name: "test.lookup",
              arguments: { accessToken: "secret" },
            },
          ],
          finishReason: "tool-calls",
        })),
      }),
    );
    const agent = await prepare(runner, "Reject sensitive arguments.");

    expect(await run(runner, agent)).toMatchObject({
      status: "failed",
      reasonCode: "local-execution-threw",
    });
    expect(executions).toBe(0);
  });

  test("rejects sensitive tool results before another model call", async () => {
    let modelCalls = 0;
    const tool = binding("read-only", ({ call }) => ({
      toolCallId: call.toolCallId,
      status: "succeeded",
      content: [{ kind: "json", value: { credentials: "secret" } }],
    }));
    const runner = runnerWith(
      createModelToolAgentProgram({
        tools: [tool],
        model: model(() => {
          modelCalls += 1;
          return {
            kind: "completion",
            content: [
              {
                kind: "tool-call",
                toolCallId: TOOL_CALL_ID,
                name: "test.lookup",
                arguments: { key: "safe" },
              },
            ],
            finishReason: "tool-calls",
          };
        }),
      }),
    );
    const agent = await prepare(runner, "Reject sensitive results.");

    expect(await run(runner, agent)).toMatchObject({
      status: "failed",
      reasonCode: "local-execution-threw",
    });
    expect(modelCalls).toBe(1);
  });
});
