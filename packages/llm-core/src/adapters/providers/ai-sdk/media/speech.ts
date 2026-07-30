import type { SpeechModelV3 } from "@ai-sdk/provider";
import {
  registerSpeechGenerationResult,
  validateSpeechGenerationRequest,
  type SpeechGenerationPort,
} from "../../../../features/media/public";
import { projectNativeBytes, safeAiSdkExtensions, type AiSdkMediaAdapterOptions } from "./shared";

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  aac: "audio/aac",
  flac: "audio/flac",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
};

export const fromAiSdkSpeechModel = (
  model: SpeechModelV3,
  options: AiSdkMediaAdapterOptions,
): SpeechGenerationPort => ({
  async generate({ request, context }) {
    validateSpeechGenerationRequest(request);
    const mediaType = MEDIA_TYPES[request.outputFormat];
    if (!mediaType) {
      throw new TypeError("AI SDK speech output format has no lossless media mapping.");
    }
    try {
      const result = await model.doGenerate({
        text: request.text,
        voice: request.voice,
        outputFormat: request.outputFormat,
        instructions: request.instructions,
        speed: request.speed,
        language: request.language,
      });
      const audio = await projectNativeBytes({
        value: result.audio,
        mediaType,
        context,
        output: options.output,
      });
      return registerSpeechGenerationResult({
        audio,
        extensions: safeAiSdkExtensions(model.provider, result.response.modelId, result.warnings),
      });
    } catch {
      throw new TypeError("AI SDK speech generation failed.");
    }
  },
});
