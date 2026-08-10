import { MockLanguageModelV4 } from "ai/test";
import type { AiSdk7NativeEvent } from "../../../src/adapters/ai-sdk";
import {
  createAiSdk7Model,
  createInMemoryAiSdk7ToolCallCorrelationStore,
} from "../../../src/adapters/ai-sdk";
import { createBuiltinModelProfile } from "../../../src/features/model/runtime";
import { INVOCATION_ID } from "./model-fixtures";

Object.assign(globalThis, { AI_SDK_LOG_WARNINGS: false });

const events: AiSdk7NativeEvent[] = [];
const model = new MockLanguageModelV4({
  provider: "pinned-provider",
  modelId: "pinned-model",
  doGenerate: {
    content: [
      {
        type: "text",
        text: '{"answer":42}',
        providerMetadata: { pinned: { region: "sg" } },
      },
      {
        type: "source",
        sourceType: "url",
        id: "source-1",
        url: "https://example.test/source",
        title: "Pinned source",
      },
    ],
    finishReason: { unified: "stop", raw: "provider-stop" },
    usage: {
      inputTokens: { total: 4, noCache: 4, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 2, text: 2, reasoning: 0 },
      raw: { providerInputTokens: 4 },
    },
    providerMetadata: { pinned: { region: "sg" } },
    request: { body: { requestMode: "pinned" } },
    response: {
      id: "pinned-response",
      modelId: "pinned-model",
      timestamp: new Date(0),
      headers: { "x-pinned": "true" },
      body: { responseMode: "pinned" },
    },
    warnings: [{ type: "other", message: "pinned warning" }],
  },
});
const adapter = createAiSdk7Model({
  model,
  profile: createBuiltinModelProfile(),
  toolCallCorrelationStore: createInMemoryAiSdk7ToolCallCorrelationStore({ maxScopes: 4 }),
  nativeContract: {
    redact: ({ value }) => value,
    observe: (event) => {
      events.push(event);
    },
  },
});

const response = await adapter.generate({
  request: {
    messages: [{ role: "user", content: [{ kind: "text", text: "Return JSON" }] }],
    responseFormat: { kind: "json" },
  },
  context: { invocationId: INVOCATION_ID },
});

console.log(JSON.stringify({ response, events }));
