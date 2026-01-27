import type { SpeechModelV3 } from "@ai-sdk/provider";
import type { AdapterCallContext, SpeechCall, SpeechModel, SpeechResult, Blob } from "../types";
import { bindFirst } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import type { MaybePromise } from "#shared/maybe";
import { validateSpeechInput } from "../input-validation";
import { toBytes } from "../binary";
import { createAdapterResult, toProviderOptions } from "./utils";

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

type SpeechResultContext = {
  diagnostics: ReturnType<typeof validateSpeechInput>;
  contentType: string | undefined;
};

const mapSpeechResult = (
  context: SpeechResultContext,
  result: Awaited<ReturnType<SpeechModelV3["doGenerate"]>>,
): SpeechResult =>
  createAdapterResult({
    result,
    diagnostics: context.diagnostics,
    toPayload: (res) => ({
      audio: toBlob(res.audio, context.contentType),
    }),
  });

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
