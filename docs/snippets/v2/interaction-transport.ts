import { createAiSdkUiWebSocketTransport } from "@geekist/llm-core/adapters/ai-sdk-ui";

const transport = createAiSdkUiWebSocketTransport({
  url: "wss://example.test/chat",
  readData: () => ({ providerId: "example", modelId: "model-1" }),
  readAuth: () => [{ providerId: "example", token: "host-supplied-token" }],
  onEvent: ({ direction, message }) => {
    // Observed authentication messages expose "[redacted]", never the token.
    console.log(direction, message.type);
  },
});

void transport;
