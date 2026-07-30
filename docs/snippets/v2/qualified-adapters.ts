import {
  createAiSdk7Model,
  createInMemoryAiSdk7ToolCallCorrelationStore,
} from "@geekist/llm-core/adapters/ai-sdk";
import { createAiSdkUiProjectionMapper } from "@geekist/llm-core/adapters/ai-sdk-ui";
import type { RegisteredModelProfile } from "@geekist/llm-core/model";
import type { LanguageModel } from "ai";

declare const providerModel: LanguageModel;
declare const profile: RegisteredModelProfile;

// Process-local example. Use a durable store implementation when conversation
// replay must survive process reconstruction.
const model = createAiSdk7Model({
  model: providerModel,
  profile,
  toolCallCorrelationStore: createInMemoryAiSdk7ToolCallCorrelationStore({
    maxScopes: 1_000,
  }),
  redactProviderMetadata: (metadata) => ({
    providerCount: Object.keys(metadata).length,
  }),
});

const projectForAiSdkUi = createAiSdkUiProjectionMapper();

void model;
void projectForAiSdkUi;
