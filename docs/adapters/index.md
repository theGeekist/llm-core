# Qualified adapters

Adapters translate a provider or UI SDK at the boundary. Import only the
qualified adapter you use; there is no public broad adapters barrel.

## AI SDK model

```ts
import { createAiSdk7Model } from "@geekist/llm-core/adapters/ai-sdk";

const model = createAiSdk7Model({
  model: providerModel,
  profile: registeredProfile,
  redactProviderMetadata: (metadata) => safeProviderProjection(metadata),
});
const response = await model.generate(request, invocationContext);
```

The adapter returns the neutral model contract. Provider-native response data
may appear only as a namespaced, redacted extension.

## AI SDK UI projection

```ts
import { createAiSdkUiProjectionMapper } from "@geekist/llm-core/adapters/ai-sdk-ui";

const project = createAiSdkUiProjectionMapper();
for await (const event of interactionRun.events()) {
  for (const chunk of project(event)) {
    await uiStream.write(chunk);
  }
}
```

## assistant-ui projection

```ts
import { createAssistantUiProjectionMapper } from "@geekist/llm-core/adapters/assistant-ui";

const project = createAssistantUiProjectionMapper({
  includeReasoning: false,
});
for await (const event of interactionRun.events()) {
  for (const command of project(event)) {
    await commandStream.write(command);
  }
}
```

## OpenAI ChatKit projection

```ts
import { createChatKitProjectionMapper } from "@geekist/llm-core/adapters/openai-chatkit";

const project = createChatKitProjectionMapper();
for await (const event of interactionRun.events()) {
  for (const chatKitEvent of project(event)) {
    eventTarget.dispatchEvent(chatKitEvent);
  }
}
```

## NLUX session adapter

```ts
import { createNluxChatAdapter } from "@geekist/llm-core/adapters/nlux-ui";

const adapter = createNluxChatAdapter({
  session,
  invocationContext: () => invocationContext,
  mapInput: (message) => ({ prompt: message }),
});
```

The NLUX adapter drives the same interaction-session lifecycle and projects
canonical events into streaming text. Install the corresponding peer only
when its qualified adapter is used.
