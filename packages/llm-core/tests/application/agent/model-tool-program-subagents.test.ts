import { contractVersion } from "#contracts";
import { expect, test } from "bun:test";
import type { PreparedAgentDefinition } from "../../../src/features/agent/public";
import type { ModelRequest } from "../../../src/features/model/public";
import { createModelToolAgentProgram } from "../../support/local-agent/public";

import {
  RUN_ID,
  TOOL_CALL_ID,
  binding,
  declaredSubagent,
  model,
  prepare,
  run,
  runnerWith,
} from "../../support/model-tool-program-fixtures";

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
    output: { kind: "text", text: "final" },
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

  expect(await run(runner, parent)).toMatchObject({
    status: "completed",
    output: { kind: "text", text: "closed" },
  });
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
    output: { kind: "text", text: "forgery rejected" },
  });
});
