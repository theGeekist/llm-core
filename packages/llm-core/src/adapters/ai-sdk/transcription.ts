import type { TranscriptionModelV3 } from "@ai-sdk/provider";
import type {
  AdapterCallContext,
  TranscriptionCall,
  TranscriptionModel,
  TranscriptionResult,
} from "../types";
import { bindFirst } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import type { MaybePromise } from "#shared/maybe";
import { validateTranscriptionInput } from "../input-validation";
import { createAdapterResult, toProviderOptions } from "./utils";

const mapTranscriptionResult = (
  diagnostics: ReturnType<typeof validateTranscriptionInput>,
  result: Awaited<ReturnType<TranscriptionModelV3["doGenerate"]>>,
): TranscriptionResult =>
  createAdapterResult({
    result,
    diagnostics,
    toPayload: (res) => ({
      text: res.text,
      segments: res.segments,
      language: res.language ?? undefined,
      durationSeconds: res.durationInSeconds ?? undefined,
    }),
  });

export function fromAiSdkTranscriptionModel(model: TranscriptionModelV3): TranscriptionModel {
  function generate(call: TranscriptionCall, _context?: AdapterCallContext) {
    void _context;
    const diagnostics = validateTranscriptionInput({
      ...call.audio,
      contentType: call.audio.contentType ?? undefined,
    });
    return maybeMap(
      bindFirst(mapTranscriptionResult, diagnostics),
      model.doGenerate({
        audio: call.audio.bytes,
        mediaType: call.audio.contentType ?? "application/octet-stream",
        providerOptions: toProviderOptions(call.providerOptions ?? undefined) ?? undefined,
        headers: call.headers ?? undefined,
        abortSignal: call.abortSignal ?? undefined,
      }) as MaybePromise<Awaited<ReturnType<TranscriptionModelV3["doGenerate"]>>>,
    );
  }

  return { generate };
}
