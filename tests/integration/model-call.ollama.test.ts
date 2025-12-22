import { describe, expect } from "bun:test";
import { createOllama } from "ollama-ai-provider-v2";
import { fromAiSdkModel } from "#adapters";
import { expectTelemetryPresence, itIfEnvAll, normalizeOllamaUrl } from "./helpers";

const itWithOllamaModel = itIfEnvAll("OLLAMA_URL", "OLLAMA_MODEL");
const itWithOllamaVision = itIfEnvAll("OLLAMA_URL", "OLLAMA_VISION_MODEL");
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 60_000);
const OLLAMA_VISION_TIMEOUT_MS = Number(process.env.OLLAMA_VISION_TIMEOUT_MS ?? 120_000);

const IMAGE_64_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQAAAACCEkxzAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAB3YoTpAAAAAd0SU1FB+kMFRYiM19hUrIAAAASSURBVCjPY/gPBQyjjFEG6QwA49P+EHULNWoAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjUtMTItMjFUMjI6MzQ6NTErMDA6MDDTPh+eAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI1LTEyLTIxVDIyOjM0OjUxKzAwOjAwomOnIgAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNS0xMi0yMVQyMjozNDo1MSswMDowMPV2hv0AAAAASUVORK5CYII=";

describe("Integration model calls (AI SDK/Ollama)", () => {
  itWithOllamaModel(
    "generates text via Ollama with structured messages",
    async () => {
      const baseURL = normalizeOllamaUrl(process.env.OLLAMA_URL ?? "");
      const modelId = process.env.OLLAMA_MODEL ?? "llama3.2";
      const provider = createOllama({ baseURL });
      const model = fromAiSdkModel(provider(modelId));

      const result = await model.generate({
        messages: [
          {
            role: "user",
            content: {
              text: "Say hello in one word.",
              parts: [{ type: "text", text: "Say hello in one word." }],
            },
          },
        ],
      });

      expect(result.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(result);
    },
    OLLAMA_TIMEOUT_MS,
  );

  itWithOllamaVision(
    "supports vision messages via Ollama",
    async () => {
      const baseURL = normalizeOllamaUrl(process.env.OLLAMA_URL ?? "");
      const modelId = process.env.OLLAMA_VISION_MODEL ?? "llava";
      const provider = createOllama({ baseURL });
      const model = fromAiSdkModel(provider(modelId));

      const result = await model.generate({
        messages: [
          {
            role: "user",
            content: {
              text: "Describe the image in one word.",
              parts: [
                { type: "text", text: "Describe the image in one word." },
                { type: "file", data: IMAGE_64_PNG, mediaType: "image/png" },
              ],
            },
          },
        ],
      });

      expect(result.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(result);
    },
    OLLAMA_VISION_TIMEOUT_MS,
  );
});
