import type { JSONValue } from "@ai-sdk/provider";
import type { AdapterDiagnostic, ModelTelemetry, AdapterTraceEvent, ModelMeta } from "../types";
import { toAdapterTrace } from "../telemetry";
import { toDiagnostics, toMeta, toTelemetry } from "./telemetry";

export const toProviderOptions = (options?: Record<string, Record<string, unknown>>) =>
  (options ?? {}) as Record<string, Record<string, JSONValue>>;

export type ProviderResultV3<Response> = {
  request?: { body?: unknown };
  response: Response & {
    modelId: string;
    timestamp?: Date;
    headers?: Record<string, string>;
    body?: unknown;
  };
  warnings?: unknown[];
  providerMetadata?: unknown;
};

export type AdapterResultOptions<TResult, TRes extends ProviderResultV3<unknown>> = {
  result: TRes;
  diagnostics: AdapterDiagnostic[];
  toPayload: (result: TRes) => TResult;
};

export const createAdapterResult = <TResult, TRes extends ProviderResultV3<unknown>>(
  options: AdapterResultOptions<TResult, TRes>,
): TResult & {
  diagnostics: AdapterDiagnostic[];
  telemetry: ModelTelemetry;
  trace: AdapterTraceEvent[] | undefined;
  meta: ModelMeta;
  raw: TRes;
} => {
  const { result, diagnostics, toPayload } = options;
  const mergedDiagnostics = diagnostics.concat(toDiagnostics(result.warnings));
  const telemetry = toTelemetry({
    request: result.request ? { body: result.request.body } : undefined,
    response: {
      modelId: result.response.modelId,
      timestamp: result.response.timestamp,
      headers: result.response.headers,
      body: result.response.body,
    },
    warnings: result.warnings,
    providerMetadata: result.providerMetadata as Record<string, unknown> | undefined,
  });

  return {
    ...toPayload(result),
    diagnostics: mergedDiagnostics,
    telemetry,
    trace: toAdapterTrace(telemetry),
    meta: toMeta({ modelId: result.response.modelId }),
    raw: result,
  };
};
