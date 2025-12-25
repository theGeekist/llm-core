import type { ImageModelV2, JSONValue } from "@ai-sdk/provider";
import type { AdapterCallContext, ImageCall, ImageModel, ImageResult, Blob } from "../types";
import { fromPromiseLike, mapMaybe } from "../../maybe";
import { toAdapterTrace } from "../telemetry";
import { validateImageInput } from "../input-validation";
import { toBytes } from "../binary";
import { toDiagnostics, toMeta, toTelemetry } from "./telemetry";

const toBlob = (value: Uint8Array | string, contentType?: string): Blob => ({
  bytes: toBytes(value),
  contentType,
});

const toSize = (value: string | undefined) =>
  value && value.includes("x") ? (value as `${number}x${number}`) : undefined;

const toAspectRatio = (value: string | undefined) =>
  value && value.includes(":") ? (value as `${number}:${number}`) : undefined;

const toImageResult = (
  result: Awaited<ReturnType<ImageModelV2["doGenerate"]>>,
  diagnostics: ReturnType<typeof validateImageInput>,
): ImageResult => {
  const mergedDiagnostics = diagnostics.concat(toDiagnostics(result.warnings));
  const telemetry = toTelemetry({
    response: {
      modelId: result.response.modelId,
      timestamp: result.response.timestamp,
      headers: result.response.headers,
    },
    warnings: result.warnings,
    providerMetadata: result.providerMetadata as Record<string, unknown> | undefined,
  });
  return {
    images: result.images.map((image) => toBlob(image)),
    diagnostics: mergedDiagnostics,
    telemetry,
    trace: toAdapterTrace(telemetry),
    meta: toMeta({ modelId: result.response.modelId }),
    raw: result,
  };
};

const toProviderOptions = (options?: Record<string, Record<string, unknown>>) =>
  (options ?? {}) as Record<string, Record<string, JSONValue>>;

export function fromAiSdkImageModel(model: ImageModelV2): ImageModel {
  function generate(call: ImageCall, _context?: AdapterCallContext) {
    void _context;
    const diagnostics = validateImageInput(call.prompt);
    return mapMaybe(
      fromPromiseLike(
        model.doGenerate({
          prompt: call.prompt,
          n: call.count ?? 1,
          size: toSize(call.size),
          aspectRatio: toAspectRatio(call.aspectRatio),
          seed: call.seed,
          providerOptions: toProviderOptions(call.providerOptions),
          headers: call.headers,
          abortSignal: call.abortSignal,
        }),
      ),
      (result) => toImageResult(result, diagnostics),
    );
  }

  return { generate };
}
