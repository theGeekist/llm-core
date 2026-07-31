import { describe, expect, test } from "bun:test";
import { createAgent } from "../../src/agent";
import { createBuiltinModel } from "../../src/features/model/public";

describe("common Agent facade", () => {
  test("runs an ordinary model journey without runner or invocation plumbing", async () => {
    const builtin = createBuiltinModel();
    const agent = createAgent({
      model: {
        ...builtin,
        generate: () => ({
          kind: "completion",
          content: [{ kind: "text", text: "Clear answer." }],
          finishReason: "stop",
        }),
      },
      instructions: "Answer clearly.",
    });

    const run = agent.start("Why is the sky blue?");
    const events = (async () => {
      const kinds: string[] = [];
      for await (const event of run.events()) kinds.push(event.kind);
      return kinds;
    })();

    expect(await run.result()).toMatchObject({
      status: "completed",
      output: "Clear answer.",
    });
    expect(await events).toEqual(["agent.run.started", "agent.run.completed"]);
    expect(await agent.run("Again.")).toMatchObject({
      status: "completed",
      output: "Clear answer.",
    });
  });
});
