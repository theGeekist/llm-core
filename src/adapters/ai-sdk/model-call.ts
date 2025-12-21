import type { Prompt } from "ai";
import type { AdapterModelCall } from "../types";
import { fromAiSdkMessage } from "./messages";

export function fromAiSdkPrompt(prompt: Prompt): AdapterModelCall {
  if (typeof prompt === "string") {
    return { prompt, system: undefined };
  }

  if (prompt.messages && prompt.messages.length) {
    return {
      messages: prompt.messages.map(fromAiSdkMessage),
      system: prompt.system,
    };
  }

  if ("prompt" in prompt && Array.isArray(prompt.prompt)) {
    return {
      messages: prompt.prompt.map(fromAiSdkMessage),
      system: prompt.system,
    };
  }

  return {
    prompt: typeof prompt.prompt === "string" ? prompt.prompt : "",
    system: prompt.system,
  };
}
