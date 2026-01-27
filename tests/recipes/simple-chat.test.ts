import { describe, expect, it } from "bun:test";
import { createHelper } from "@wpkernel/pipeline";
import { recipes } from "../../src/recipes";
import { __test__ as simpleChatInternals } from "../../src/recipes/simple-chat";
import { assertSyncOutcome } from "../workflow/helpers";
import { createMockModel } from "../fixtures/factories";

const useHelper = (pipeline: unknown, helper: unknown) => {
  (pipeline as { use: (value: unknown) => void }).use(helper);
};

describe("Simple Chat Recipe", () => {
  it("builds a workflow with default configuration", () => {
    const workflow = recipes["chat.simple"]();
    expect(workflow).toBeDefined();
    // Verify it targets the 'agent' contract
    // The exact internal structure depends on the builder implementation,
    // but we can verify it builds successfully.
    const runtime = workflow.build();
    expect(runtime).toBeDefined();
  });

  it("configures model provider", () => {
    const workflow = recipes["chat.simple"]({ model: "test-model" });
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
    const workflow = recipes["chat.simple"]({ system: "You are a helpful assistant." });
    const runtime = workflow.build();
    const explanation = runtime.explain();
    expect(explanation).toBeDefined();
  });

  it("exposes the simple-chat respond step in the plan", () => {
    const workflow = recipes["chat.simple"]();
    const plan = workflow.explain();
    expect(plan.steps.some((step) => step.id === "simple-chat.respond")).toBe(true);
  });

  it("responds using the model adapter", () => {
    const model = createMockModel("hello");
    const workflow = recipes["chat.simple"]().defaults({ adapters: { model } });
    const runtime = workflow.build();
    const outcome = assertSyncOutcome(runtime.run({ input: "question" }));
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const agent = (outcome.artefact as { agent?: { response?: string } }).agent;
    expect(agent?.response).toBe("hello");
  });

  it("adds system config plugin when system prompt is set", () => {
    const workflow = recipes["chat.simple"]({ system: "Keep it short." });
    let seen: string | undefined;
    const readerPlugin = {
      key: "test.read.system",
      helperKinds: ["test.system"],
      register: (pipeline: unknown) => {
        useHelper(
          pipeline,
          createHelper({
            key: "test.read.system",
            kind: "test.system",
            apply: (options) => {
              const ctx = options.context as { system?: string };
              seen = ctx.system;
            },
          }),
        );
      },
    };
    const workflowWithReader = workflow.defaults({ plugins: [readerPlugin] });
    const runtime = workflowWithReader.build();
    const explanation = runtime.explain();

    expect(explanation.plugins).toContain("config.system");
    const outcome = assertSyncOutcome(runtime.run({ input: "question" }));
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(seen).toBe("Keep it short.");
  });

  it("ignores non-object system context values", () => {
    expect(simpleChatInternals.readSystemPrompt(null)).toBeNull();
    expect(simpleChatInternals.readSystemPrompt("system")).toBeNull();
    expect(simpleChatInternals.readSystemPrompt({ system: 123 })).toBeNull();
  });
});
