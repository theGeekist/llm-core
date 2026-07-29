import { createAiSdk7Model } from "@geekist/llm-core/adapters/ai-sdk";
import { createAiSdkUiProjectionMapper } from "@geekist/llm-core/adapters/ai-sdk-ui";
import type { RegisteredModelProfile } from "@geekist/llm-core/model";
import type { LanguageModel } from "ai";

declare const providerModel: LanguageModel;
declare const profile: RegisteredModelProfile;

const model = createAiSdk7Model({
  model: providerModel,
  profile,
  redactProviderMetadata: (metadata) => ({
    providerCount: Object.keys(metadata).length,
  }),
});

const projectForAiSdkUi = createAiSdkUiProjectionMapper();

void model;
void projectForAiSdkUi;
