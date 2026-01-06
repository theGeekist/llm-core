import type { ImageModelV3, ImageModelV3Usage, JSONValue } from "@ai-sdk/provider";
import type {
  AdapterCallContext,
  ImageCall,
  ImageModel,
  ImageResult,
  Blob,
  ModelUsage,
} from "../types";
import { bindFirst, maybeMap } from "../../maybe";
import type { MaybePromise } from "../../maybe";
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
  result: Awaited<ReturnType<ImageModelV3["doGenerate"]>>,
  diagnostics: ReturnType<typeof validateImageInput>,
): ImageResult => {
  const mergedDiagnostics = diagnostics.concat(toDiagnostics(result.warnings));
  const usage = toModelUsage(result.usage);
  const telemetry = toTelemetry({
    response: {
      modelId: result.response.modelId,
      timestamp: result.response.timestamp,
      headers: result.response.headers,
    },
    usage,
    warnings: result.warnings,
    providerMetadata: result.providerMetadata as Record<string, unknown> | undefined,
  });
  return {
    images: result.images.map((image) => toBlob(image)),
    diagnostics: mergedDiagnostics,
    telemetry,
    trace: toAdapterTrace(telemetry),
    meta: toMeta({ modelId: result.response.modelId }),
    usage,
    raw: result,
  };
};

const toProviderOptions = (options?: Record<string, Record<string, unknown>>) =>
  (options ?? {}) as Record<string, Record<string, JSONValue>>;

const toModelUsage = (usage?: ImageModelV3Usage): ModelUsage | undefined =>
  usage
    ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      }
    : undefined;

const mapImageResult = (
  diagnostics: ReturnType<typeof validateImageInput>,
  result: Awaited<ReturnType<ImageModelV3["doGenerate"]>>,
): ImageResult => toImageResult(result, diagnostics);

export function fromAiSdkImageModel(model: ImageModelV3): ImageModel {
  function generate(call: ImageCall, _context?: AdapterCallContext) {
    void _context;
    const diagnostics = validateImageInput(call.prompt);
    return maybeMap(
      bindFirst(mapImageResult, diagnostics),
      model.doGenerate({
        prompt: call.prompt,
        n: call.count ?? 1,
        size: toSize(call.size ?? undefined),
        aspectRatio: toAspectRatio(call.aspectRatio ?? undefined),
        seed: call.seed ?? undefined,
        files: undefined,
        mask: undefined,
        providerOptions: toProviderOptions(call.providerOptions ?? undefined),
        headers: call.headers ?? undefined,
        abortSignal: call.abortSignal ?? undefined,
      }) as MaybePromise<Awaited<ReturnType<ImageModelV3["doGenerate"]>>>,
    );
  }

  return { generate };
}
