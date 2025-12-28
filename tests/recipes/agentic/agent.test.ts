import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../../workflow/helpers";
import { recipes } from "../../../src/recipes";
import { createAgentModel, createEchoTool, createMemoryTracker } from "./helpers";

describe("Agentic composite recipe", () => {
  it("composes planning, tools, finalize, and memory packs", () => {
    const model = createAgentModel();
    const tool = createEchoTool();
    const { memory, calls } = createMemoryTracker();
    const runtime = recipes
      .agent()
      .defaults({ adapters: { model, tools: [tool], memory } })
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "ping" }));

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const agent = (outcome.artefact as { agent?: { response?: string } }).agent;
    expect(agent?.response).toBe("final-response");
    expect(calls.map((entry) => entry.type)).toEqual(["load", "save"]);
  });
});
