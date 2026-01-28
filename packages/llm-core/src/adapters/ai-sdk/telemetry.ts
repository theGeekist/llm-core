import type { AdapterDiagnostic, ModelMeta, ModelTelemetry, ModelUsage } from "../types";
import { warnDiagnostic } from "../utils";

export const toDiagnostics = (warnings?: unknown[]): AdapterDiagnostic[] =>
  warnings?.map((warning) => warnDiagnostic("provider_warning", warning)) ?? [];

type TelemetryInput = {
  request?: { body?: unknown };
  response?: {
    id?: string;
    modelId?: string;
    timestamp?: Date;
    headers?: Record<string, string>;
    body?: unknown;
  };
  usage?: ModelUsage;
  totalUsage?: ModelUsage;
  warnings?: unknown[];
  providerMetadata?: Record<string, unknown>;
};

export const toTelemetry = (input: TelemetryInput): ModelTelemetry => ({
  request: input.request ? { body: input.request.body } : undefined,
  response: input.response
    ? {
        id: input.response.id,
        modelId: input.response.modelId,
        timestamp: input.response.timestamp?.getTime(),
        headers: input.response.headers,
        body: input.response.body,
      }
    : undefined,
  usage: input.usage,
  totalUsage: input.totalUsage,
  warnings: toDiagnostics(input.warnings),
  providerMetadata: input.providerMetadata,
});

export const toMeta = (response?: { modelId?: string; id?: string }): ModelMeta => ({
  provider: "ai-sdk",
  modelId: response?.modelId,
  requestId: response?.id,
});
