import { describe, expect, test } from "bun:test";
import type { ConversationMessage, ConversationStore } from "../../../src/features/memory/public";
import type { ModelRequest } from "../../../src/features/model/public";
import { createModelToolAgentProgram } from "../../support/local-agent/public";

import {
  CONVERSATION_ID,
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
      output: { kind: "text", text: "next answer" },
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
