import { describe, expect } from "bun:test";
import { anthropic } from "@ai-sdk/anthropic";
import { fromAiSdkModel } from "#adapters";
import { expectTelemetryPresence, expectTelemetryUsage, itIfEnv } from "./helpers";

const itWithAnthropic = itIfEnv("ANTHROPIC_API_KEY");
const ANTHROPIC_TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 60_000);

describe("Integration model calls (AI SDK/Anthropic)", () => {
  itWithAnthropic(
    "generates text via Anthropic",
    async () => {
      const modelId = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
      const model = fromAiSdkModel(anthropic(modelId));
      const result = await model.generate({
        prompt: "Say hi in one word.",
      });

      expect(result.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(result);
      expectTelemetryUsage(result.telemetry?.usage);
    },
    ANTHROPIC_TIMEOUT_MS,
  );
});
