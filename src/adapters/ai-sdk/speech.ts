import type { JSONValue, SpeechModelV3 } from "@ai-sdk/provider";
import type { AdapterCallContext, SpeechCall, SpeechModel, SpeechResult, Blob } from "../types";
import { bindFirst } from "../../shared/fp";
import { maybeMap } from "../../shared/maybe";
import type { MaybePromise } from "../../shared/maybe";
import { toAdapterTrace } from "../telemetry";
import { validateSpeechInput } from "../input-validation";
import { toBytes } from "../binary";
import { toDiagnostics, toMeta, toTelemetry } from "./telemetry";

const toAudioType = (format?: string | null) => {
  if (!format) {
    return null;
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
  return mapping[format] ?? null;
};

const toBlob = (value: Uint8Array | string, contentType?: string): Blob => ({
  bytes: toBytes(value),
  contentType,
});

const toSpeechResult = (
  result: Awaited<ReturnType<SpeechModelV3["doGenerate"]>>,
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

type SpeechResultContext = {
  diagnostics: ReturnType<typeof validateSpeechInput>;
  contentType: string | undefined;
};

const mapSpeechResult = (
  context: SpeechResultContext,
  result: Awaited<ReturnType<SpeechModelV3["doGenerate"]>>,
): SpeechResult => toSpeechResult(result, context.diagnostics, context.contentType);

export function fromAiSdkSpeechModel(model: SpeechModelV3): SpeechModel {
  function generate(call: SpeechCall, _context?: AdapterCallContext) {
    void _context;
    const diagnostics = validateSpeechInput(call.text);
    const contentType = toAudioType(call.outputFormat) ?? undefined;
    const resultContext: SpeechResultContext = { diagnostics, contentType };
    return maybeMap(
      bindFirst(mapSpeechResult, resultContext),
      model.doGenerate({
        text: call.text,
        voice: call.voice ?? undefined,
        outputFormat: call.outputFormat ?? undefined,
        instructions: call.instructions ?? undefined,
        speed: call.speed ?? undefined,
        language: call.language ?? undefined,
        providerOptions: toProviderOptions(call.providerOptions ?? undefined),
        headers: call.headers ?? undefined,
        abortSignal: call.abortSignal ?? undefined,
      }) as MaybePromise<Awaited<ReturnType<SpeechModelV3["doGenerate"]>>>,
    );
  }

  return { generate };
}
