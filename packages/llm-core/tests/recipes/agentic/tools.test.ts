import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../../workflow/helpers";
import { recipes } from "../../../src/recipes";
import { createAgentModel, createEchoTool } from "./helpers";

describe("Agentic tools pack", () => {
  it("executes tool calls and stores results", () => {
    const model = createAgentModel();
    const tool = createEchoTool();
    const runtime = recipes
      .agent()
      .use(recipes["agent.planning"]())
      .use(recipes["agent.tools"]())
      .defaults({ adapters: { model, tools: [tool] } })
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "ping" }));

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const agent = (outcome.artefact as { agent?: { toolResults?: unknown[] } }).agent;
    expect(agent?.toolResults).toEqual([
      { name: "echo", toolCallId: "tool-1", result: { value: "ping" } },
    ]);
  });
});
