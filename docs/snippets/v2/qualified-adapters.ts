import {
  createAiSdk7Model,
  createInMemoryAiSdk7ToolCallCorrelationStore,
} from "@geekist/llm-core/adapters/ai-sdk";
import type { AiSdk7NativeContract } from "@geekist/llm-core/adapters/ai-sdk";
import { createAiSdkUiProjectionMapper } from "@geekist/llm-core/adapters/ai-sdk-ui";
import type { ModelProfile } from "@geekist/llm-core/model/runtime";
import type { LanguageModel } from "ai";

declare const providerModel: LanguageModel;
declare const profile: ModelProfile;
declare const nativeContract: AiSdk7NativeContract;

// Process-local example. Use a durable store implementation when conversation
// replay must survive process reconstruction.
const model = createAiSdk7Model({
  model: providerModel,
  profile,
  toolCallCorrelationStore: createInMemoryAiSdk7ToolCallCorrelationStore({
    maxScopes: 1_000,
  }),
  nativeContract,
});

const projectForAiSdkUi = createAiSdkUiProjectionMapper();

void model;
void projectForAiSdkUi;
