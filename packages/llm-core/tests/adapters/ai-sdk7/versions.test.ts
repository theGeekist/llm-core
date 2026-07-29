import { describe, expect, it } from "bun:test";
import packageJson from "../../../package.json";

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

  it("publishes matching v7 peer generations without global AI overrides", () => {
    expect(packageJson.peerDependencies.ai).toBe("^7.0.37");
    expect(packageJson.peerDependencies["@ai-sdk/provider"]).toBe("^4.0.3");
    expect(packageJson.peerDependencies["@ai-sdk/provider-utils"]).toBe("^5.0.12");
    expect(packageJson.peerDependencies["@ai-sdk/openai"]).toBe("^4.0.20");
    expect(packageJson.peerDependencies["@ai-sdk/anthropic"]).toBe("^4.0.21");
    expect(packageJson.peerDependencies["@ai-sdk/react"]).toBe("^4.0.40");
    expect(packageJson.overrides).not.toHaveProperty("ai");
    expect(packageJson.overrides).not.toHaveProperty("@ai-sdk/react");
  });
});
