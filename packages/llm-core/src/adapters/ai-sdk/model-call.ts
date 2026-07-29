import type { Prompt } from "ai";
import type { ModelCall } from "../types";
import { fromAiSdkMessage } from "./messages";

const toSystemText = (instructions: Prompt["instructions"]): string | undefined => {
  const messages =
    typeof instructions === "string"
      ? null
      : instructions
        ? Array.isArray(instructions)
          ? instructions
          : [instructions]
        : null;
  return typeof instructions === "string"
    ? instructions
    : messages?.map((message) => message.content).join("\n");
};

export function fromAiSdkPrompt(prompt: Prompt): ModelCall {
  if (typeof prompt === "string") {
    return { prompt, system: undefined };
  }

  if (prompt.messages && prompt.messages.length) {
    return {
      messages: prompt.messages.map(fromAiSdkMessage),
      system: toSystemText(prompt.instructions ?? prompt.system),
    };
  }

  if ("prompt" in prompt && Array.isArray(prompt.prompt)) {
    return {
      messages: prompt.prompt.map(fromAiSdkMessage),
      system: toSystemText(prompt.instructions ?? prompt.system),
    };
  }

  return {
    prompt: typeof prompt.prompt === "string" ? prompt.prompt : "",
    system: toSystemText(prompt.instructions ?? prompt.system),
  };
}
