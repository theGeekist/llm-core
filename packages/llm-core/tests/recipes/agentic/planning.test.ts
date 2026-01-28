import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../../workflow/helpers";
import { recipes } from "../../../src/recipes";
import { createAgentModel } from "./helpers";

describe("Agentic planning pack", () => {
  it("stores plan output from the model", () => {
    const model = createAgentModel();
    const runtime = recipes["agent.planning"]().defaults({ adapters: { model } }).build();
    const outcome = assertSyncOutcome(runtime.run({ input: "hello", context: "sys" }));

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const agent = (outcome.artefact as { agent?: { plan?: string } }).agent;
    expect(agent?.plan).toBe("plan-response");
  });
});
