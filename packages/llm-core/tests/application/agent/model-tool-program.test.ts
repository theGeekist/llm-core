import { contractVersion } from "#contracts";
import { describe, expect, test } from "bun:test";
import type { ExecuteControlledToolInput } from "../../../src/application/tool-execution/public";
import type { Model, ModelRequest } from "../../../src/features/model/public";
import { type ExecutableTool, type ToolCall } from "../../../src/features/tooling/runtime";
import { createModelToolAgentProgram } from "../../support/local-agent/public";

import {
  INVOCATION_ID,
  TOOL_CALL_ID,
  binding,
  model,
  prepare,
  request,
  run,
  runnerWith,
} from "../../support/model-tool-program-fixtures";

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
    expect(result).toMatchObject({
      status: "completed",
      output: { kind: "text", text: "done" },
    });
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
      output: { kind: "text", text: "The answer is 42." },
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
      output: { kind: "text", text: "not executed" },
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
      output: { kind: "text", text: "controlled" },
    });
    expect(controlledExecutions).toBe(1);
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
});
