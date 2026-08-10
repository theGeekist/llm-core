import type { LanguageModelUsage } from "ai";
import { nativeExtensions, type JsonValue } from "#contracts";
import type { ModelWarning, ProviderResponseMetadata } from "../../features/model/public";
import type { ModelProfile } from "../../features/model/runtime";
import { AI_SDK7_AUTHORITY } from "./native-contract";

export const AI_SDK_SUPPORTED_VERSION = "7.0.37";
export const AI_SDK_EXTENSION_NAMESPACE = "dev.ai-sdk";

export const toModelUsage = (
  usage?: LanguageModelUsage,
): import("../../features/model/public").ModelUsage | undefined =>
  usage
    ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        reasoningTokens: usage.outputTokenDetails.reasoningTokens,
        cachedInputTokens: usage.inputTokenDetails.cacheReadTokens,
      }
    : undefined;

const asRecord = (value: JsonValue): Record<string, JsonValue> | undefined =>
  value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;

const warningCode = (warning: Record<string, JsonValue>): string =>
  typeof warning.type === "string" ? `ai-sdk.${warning.type}` : "ai-sdk.provider-warning";

const detailSuffix = (details: string | undefined): string => (details ? ` (${details})` : "");

const genericWarning = "AI SDK provider warning.";

const featureWarning = (prefix: string, warning: Record<string, JsonValue>): string =>
  typeof warning.feature === "string"
    ? `${prefix}${warning.feature}${detailSuffix(
        typeof warning.details === "string" ? warning.details : undefined,
      )}`
    : genericWarning;

const warningMessages: Record<string, (warning: Record<string, JsonValue>) => string> = {
  unsupported: (warning) => featureWarning("Unsupported AI SDK feature: ", warning),
  compatibility: (warning) => featureWarning("AI SDK compatibility adjustment: ", warning),
  deprecated: (warning) =>
    typeof warning.setting === "string" && typeof warning.message === "string"
      ? `Deprecated AI SDK setting ${warning.setting}: ${warning.message}`
      : genericWarning,
  other: (warning) => (typeof warning.message === "string" ? warning.message : genericWarning),
};

const warningMessage = (warning: Record<string, JsonValue>): string =>
  typeof warning.type === "string"
    ? (warningMessages[warning.type]?.(warning) ?? genericWarning)
    : genericWarning;

export const toModelWarnings = (warnings?: readonly JsonValue[]): ModelWarning[] | undefined =>
  warnings?.length
    ? warnings.map((value) => {
        const warning = asRecord(value) ?? {};
        return {
          code: warningCode(warning),
          message: warningMessage(warning),
          severity: "warning",
        };
      })
    : undefined;

type MetadataInput = {
  profile: ModelProfile;
  response?: JsonValue;
  providerMetadata?: JsonValue;
};

export const toResponseMetadata = (input: MetadataInput): ProviderResponseMetadata => {
  const response = input.response === undefined ? undefined : asRecord(input.response);
  const adapterFacts: Record<string, JsonValue> = {
    authority: AI_SDK7_AUTHORITY,
  };
  if (input.providerMetadata !== undefined) {
    adapterFacts.providerMetadata = input.providerMetadata;
  }

  return {
    provider: input.profile.provider,
    modelId: typeof response?.modelId === "string" ? response.modelId : undefined,
    requestId: typeof response?.id === "string" ? response.id : undefined,
    extensions: nativeExtensions({ [AI_SDK_EXTENSION_NAMESPACE]: adapterFacts }),
  };
};
