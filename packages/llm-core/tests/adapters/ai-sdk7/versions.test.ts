import { describe, expect, it } from "bun:test";
import packageJson from "../../../package.json";
import { AI_SDK7_AUTHORITY, AI_SDK7_OPERATION_DISPOSITIONS } from "../../../src/adapters/ai-sdk";

const MATRIX = {
  ai: "7.0.37",
  "@ai-sdk/provider": "4.0.3",
  "@ai-sdk/provider-utils": "5.0.12",
  "@ai-sdk/openai": "4.0.20",
  "@ai-sdk/anthropic": "4.0.21",
  "@ai-sdk/react": "4.0.40",
} as const;

describe("AI SDK 7 direct dependency baseline", () => {
  it("pins the exact tested provider and UI matrix", () => {
    for (const [name, version] of Object.entries(MATRIX)) {
      expect(packageJson.devDependencies[name as keyof typeof packageJson.devDependencies]).toBe(
        version,
      );
    }
  });

  it("publishes only the qualified AI SDK peers without global AI overrides", () => {
    expect(packageJson.peerDependencies.ai).toBe("^7.0.37");
    expect(packageJson.peerDependencies["@ai-sdk/provider"]).toBe("^4.0.3");
    expect(packageJson.peerDependenciesMeta.ai?.optional).toBe(true);
    expect(packageJson.peerDependenciesMeta["@ai-sdk/provider"]?.optional).toBe(true);
    expect(packageJson.overrides).not.toHaveProperty("ai");
    expect(packageJson.overrides).not.toHaveProperty("@ai-sdk/react");
  });

  it("binds every native operation disposition to the exact tested authority", () => {
    expect(AI_SDK7_AUTHORITY).toEqual({ ai: "7.0.37", provider: "4.0.3" });
    expect(AI_SDK7_OPERATION_DISPOSITIONS.map(({ operation }) => operation)).toEqual([
      "generateText.content",
      "generateText.text",
      "generateText.reasoning",
      "generateText.reasoningText",
      "generateText.files",
      "generateText.sources",
      "generateText.toolCalls",
      "generateText.staticToolCalls",
      "generateText.dynamicToolCalls",
      "generateText.toolResults",
      "generateText.staticToolResults",
      "generateText.dynamicToolResults",
      "generateText.finishReason",
      "generateText.rawFinishReason",
      "generateText.usage",
      "generateText.totalUsage",
      "generateText.warnings",
      "generateText.request",
      "generateText.response",
      "generateText.responseMessages",
      "generateText.providerMetadata",
      "generateText.steps",
      "generateText.finalStep",
      "generateText.output",
      "generateText.steps.model",
      "generateText.steps.runtimeContext",
      "generateText.steps.toolsContext",
      "streamText.parts",
      "errors.apiCall",
      "errors.abort",
      "errors.closed",
      "errors.otherAiSdk",
      "errors.stack",
      "streamText.raw",
      "tools.providerExecution",
    ]);
    expect(AI_SDK7_OPERATION_DISPOSITIONS.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(AI_SDK7_OPERATION_DISPOSITIONS)).toBe(true);
    expect(AI_SDK7_OPERATION_DISPOSITIONS).not.toContainEqual(
      expect.objectContaining({ disposition: "not-applicable" }),
    );
  });
});
