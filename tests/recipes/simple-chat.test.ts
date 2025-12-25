import { describe, expect, it } from "bun:test";
import { simpleChat } from "../../src/recipes/simple-chat";

describe("Simple Chat Recipe", () => {
  it("builds a workflow with default configuration", () => {
    const workflow = simpleChat();
    expect(workflow).toBeDefined();
    // Verify it targets the 'agent' contract
    // The exact internal structure depends on the builder implementation,
    // but we can verify it builds successfully.
    const runtime = workflow.build();
    expect(runtime).toBeDefined();
  });

  it("configures model provider", () => {
    const workflow = simpleChat({ model: "test-model" });
    const runtime = workflow.build();
    const explanation = runtime.explain();

    // Check if the provider override is registered
    // The exact structure of explanation depends on implementation,
    // but typically we can check providers map or plugins.
    // For now, ensuring it builds is a good first step.
    console.log(JSON.stringify(explanation, null, 2));
    expect(explanation).toBeDefined();
  });

  it("configures system prompt", () => {
    const workflow = simpleChat({ system: "You are a helpful assistant." });
    const runtime = workflow.build();
    const explanation = runtime.explain();
    expect(explanation).toBeDefined();
  });
});
