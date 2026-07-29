import type {
  CallWarning,
  LanguageModelResponseMetadata,
  LanguageModelUsage,
  ProviderMetadata,
} from "ai";
import { nativeExtensions, type JsonValue } from "#contracts";
import type {
  ModelWarning,
  ProviderResponseMetadata,
  RegisteredModelProfile,
} from "../../../features/model/public";
import type { AiSdk7ProviderMetadataRedactor } from "./types";

export const AI_SDK_SUPPORTED_VERSION = "7.0.37";
export const AI_SDK_EXTENSION_NAMESPACE = "dev.ai-sdk";

export const AI_SDK7_SEMANTIC_LOSS = Object.freeze([
  "schema-ref identity cannot materialize a JSON Schema, so structured output uses unstructured JSON",
  "media-ref content requires composition to resolve it before invocation",
  "provider warning text is redacted to a stable generic message",
  "stream approval/native metadata has no field on the frozen ModelStreamEvent contract",
  "ModelError has no cancellation code, so AI SDK aborts map to timeout",
  "generated files and sources have no lossless frozen ModelContentPart projection",
  "multipart JSON tool results use application/json file parts because AI SDK content output has no JSON part",
]);

export const toModelUsage = (usage?: LanguageModelUsage): import(
  "../../../features/model/public"
).ModelUsage | undefined =>
  usage
    ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        reasoningTokens: usage.outputTokenDetails.reasoningTokens,
        cachedInputTokens: usage.inputTokenDetails.cacheReadTokens,
      }
    : undefined;

const warningCode = (warning: CallWarning): string => {
  if (
    typeof warning === "object" &&
    warning &&
    "type" in warning &&
    typeof warning.type === "string"
  ) {
    return `ai-sdk.${warning.type}`;
  }
  return "ai-sdk.provider-warning";
};

export const toModelWarnings = (warnings?: CallWarning[]): ModelWarning[] | undefined =>
  warnings?.length
    ? warnings.map((warning) => ({
        code: warningCode(warning),
        message: "AI SDK provider reported a redacted warning.",
        severity: "warning",
      }))
    : undefined;

type MetadataInput = {
  profile: RegisteredModelProfile;
  response?: LanguageModelResponseMetadata;
  providerMetadata?: ProviderMetadata;
  redactProviderMetadata?: AiSdk7ProviderMetadataRedactor;
  approvalRequests?: JsonValue[];
};

export const toResponseMetadata = (input: MetadataInput): ProviderResponseMetadata => {
  const redactedProviderMetadata =
    input.providerMetadata && input.redactProviderMetadata
      ? input.redactProviderMetadata(input.providerMetadata)
      : undefined;
  const adapterFacts: Record<string, JsonValue> = {
    sdkVersion: AI_SDK_SUPPORTED_VERSION,
    semanticLoss: [...AI_SDK7_SEMANTIC_LOSS],
  };
  if (redactedProviderMetadata !== undefined) {
    adapterFacts.providerMetadata = redactedProviderMetadata;
  }
  if (input.approvalRequests?.length) {
    adapterFacts.approvalRequests = input.approvalRequests;
  }

  return {
    provider: input.profile.provider,
    modelId: input.response?.modelId,
    requestId: input.response?.id,
    extensions: nativeExtensions({ [AI_SDK_EXTENSION_NAMESPACE]: adapterFacts }),
  };
};
