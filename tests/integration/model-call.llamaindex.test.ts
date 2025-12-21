import { describe, expect } from "bun:test";
import { OpenAI } from "@llamaindex/openai";
import { fromLlamaIndexMessage } from "#adapters";
import { itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);

const readMessageText = (content: unknown) => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => (typeof entry === "string" ? entry : ""))
      .join("")
      .trim();
  }
  return "";
};

describe("Integration model calls (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "generates text via OpenAI",
    async () => {
      const model = new OpenAI({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      });
      const response = await model.chat({
        messages: [{ role: "user", content: "Say hi in one word." }],
      });

      const text = readMessageText(response.message.content);
      expect(text.length).toBeGreaterThan(0);

      const adapted = fromLlamaIndexMessage(response.message);
      expect(typeof adapted.content).toBe("string");
    },
    OPENAI_TIMEOUT_MS,
  );
});
