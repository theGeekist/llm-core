import type { TranscriptionModelV3 } from "@ai-sdk/provider";
import {
  isLiveMediaInput,
  registerTranscriptionResult,
  type TranscriptionPort,
} from "../../features/media/public";
import {
  resolveLiveMedia,
  safeAiSdkExtensions,
  type AiSdkMediaAdapterOptions,
} from "./media-conversion";

export const fromAiSdkTranscriptionModel = (
  model: TranscriptionModelV3,
  options: Pick<AiSdkMediaAdapterOptions, "resources"> = {},
): TranscriptionPort => ({
  async transcribe({ request, context }) {
    if (!isLiveMediaInput(request.audio)) {
      throw new TypeError("Transcription requires valid live media input.");
    }
    try {
      const audio = await resolveLiveMedia(request.audio, context, options.resources);
      const result = await model.doGenerate({
        audio: audio.bytes,
        mediaType: audio.mediaType,
      });
      return registerTranscriptionResult({
        text: result.text,
        segments: result.segments,
        ...(result.language === undefined ? {} : { language: result.language }),
        ...(result.durationInSeconds === undefined
          ? {}
          : { durationSeconds: result.durationInSeconds }),
        extensions: safeAiSdkExtensions(model.provider, result.response.modelId, result.warnings),
      });
    } catch {
      throw new TypeError("AI SDK transcription failed.");
    }
  },
});
