import type { JSONValue, SpeechModelV2 } from "@ai-sdk/provider";
import type { AdapterCallContext, SpeechCall, SpeechModel, SpeechResult, Blob } from "../types";
import { fromPromiseLike, mapMaybe } from "../../maybe";
import { toAdapterTrace } from "../telemetry";
import { validateSpeechInput } from "../input-validation";
import { toBytes } from "../binary";
import { toDiagnostics, toMeta, toTelemetry } from "./telemetry";

const toAudioType = (format?: string) => {
  if (!format) {
    return undefined;
  }
  if (format.includes("/")) {
    return format;
  }
  const mapping: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
    flac: "audio/flac",
    webm: "audio/webm",
  };
  return mapping[format] ?? undefined;
};

const toBlob = (value: Uint8Array | string, contentType?: string): Blob => ({
  bytes: toBytes(value),
  contentType,
});

const toSpeechResult = (
  result: Awaited<ReturnType<SpeechModelV2["doGenerate"]>>,
  diagnostics: ReturnType<typeof validateSpeechInput>,
  contentType?: string,
): SpeechResult => {
  const mergedDiagnostics = diagnostics.concat(toDiagnostics(result.warnings));
  const telemetry = toTelemetry({
    request: result.request ? { body: result.request.body } : undefined,
    response: {
      modelId: result.response.modelId,
      timestamp: result.response.timestamp,
      headers: result.response.headers as Record<string, string> | undefined,
      body: result.response.body,
    },
    warnings: result.warnings,
    providerMetadata: result.providerMetadata as Record<string, unknown> | undefined,
  });
  return {
    audio: toBlob(result.audio, contentType),
    diagnostics: mergedDiagnostics,
    telemetry,
    trace: toAdapterTrace(telemetry),
    meta: toMeta({ modelId: result.response.modelId }),
    raw: result,
  };
};

const toProviderOptions = (options?: Record<string, Record<string, unknown>>) =>
  (options ?? {}) as Record<string, Record<string, JSONValue>>;

export function fromAiSdkSpeechModel(model: SpeechModelV2): SpeechModel {
  function generate(call: SpeechCall, _context?: AdapterCallContext) {
    void _context;
    const diagnostics = validateSpeechInput(call.text);
    const contentType = toAudioType(call.outputFormat);
    return mapMaybe(
      fromPromiseLike(
        model.doGenerate({
          text: call.text,
          voice: call.voice,
          outputFormat: call.outputFormat,
          instructions: call.instructions,
          speed: call.speed,
          language: call.language,
          providerOptions: toProviderOptions(call.providerOptions),
          headers: call.headers,
          abortSignal: call.abortSignal,
        }),
      ),
      (result) => toSpeechResult(result, diagnostics, contentType),
    );
  }

  return { generate };
}
