import type { ImageModelV3 } from "@ai-sdk/provider";
import {
  registerImageGenerationResult,
  validateImageGenerationRequest,
  type ImageGenerationPort,
} from "../../../../features/media/public";
import {
  projectNativeBytes,
  safeAiSdkExtensions,
  toAiSdkFile,
  type AiSdkMediaAdapterOptions,
} from "./shared";

export interface AiSdkImageAdapterOptions extends AiSdkMediaAdapterOptions {
  readonly generatedMediaType: string;
}

function toSize(value: string | undefined): `${number}x${number}` | undefined {
  if (value !== undefined && !/^[1-9]\d*x[1-9]\d*$/.test(value)) {
    throw new TypeError("AI SDK image size must use widthxheight.");
  }
  return value as `${number}x${number}`;
}

function toAspectRatio(value: string | undefined): `${number}:${number}` | undefined {
  if (value !== undefined && !/^[1-9]\d*:[1-9]\d*$/.test(value)) {
    throw new TypeError("AI SDK image aspect ratio must use width:height.");
  }
  return value as `${number}:${number}`;
}

export const fromAiSdkImageModel = (
  model: ImageModelV3,
  options: AiSdkImageAdapterOptions,
): ImageGenerationPort => ({
  async generate({ request, context }) {
    validateImageGenerationRequest(request);
    try {
      const files = request.sourceImages
        ? await Promise.all(
            request.sourceImages.map((input) => toAiSdkFile(input, context, options.resources)),
          )
        : undefined;
      const mask = request.mask
        ? await toAiSdkFile(request.mask, context, options.resources)
        : undefined;
      const result = await model.doGenerate({
        prompt: request.prompt,
        n: request.count,
        size: toSize(request.size),
        aspectRatio: toAspectRatio(request.aspectRatio),
        seed: request.seed,
        files,
        mask,
        providerOptions: {},
      });
      if (!Array.isArray(result.images) || result.images.length !== request.count) {
        throw new TypeError("AI SDK image generation returned a partial result.");
      }
      const images = await Promise.all(
        result.images.map((image) =>
          projectNativeBytes({
            value: image,
            mediaType: options.generatedMediaType,
            context,
            output: options.output,
          }),
        ),
      );
      return registerImageGenerationResult({
        images,
        ...(result.usage ? { usage: result.usage } : {}),
        extensions: safeAiSdkExtensions(model.provider, result.response.modelId, result.warnings),
      });
    } catch {
      throw new TypeError("AI SDK image generation failed.");
    }
  },
});
