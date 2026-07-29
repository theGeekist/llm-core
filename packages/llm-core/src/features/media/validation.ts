import { isCanonicalUuid, isDigest, isNativeExtensions, type PortableContent } from "#contracts";
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  LiveMediaInput,
  PortableMediaContent,
  SpeechGenerationRequest,
  SpeechGenerationResult,
  TranscriptionResult,
} from "./types";

const MEDIA_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

const exactKeys = (value: object, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

const validCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

export const isLiveMediaInput = (value: unknown): value is LiveMediaInput => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const input = value as Partial<LiveMediaInput> & { bytes?: unknown };
  if (input.kind === "bytes") {
    return (
      exactKeys(value, ["kind", "mediaType", "bytes"]) &&
      typeof input.mediaType === "string" &&
      MEDIA_TYPE.test(input.mediaType) &&
      input.bytes instanceof Uint8Array &&
      input.bytes.byteLength > 0
    );
  }
  return (
    input.kind === "resource" &&
    exactKeys(value, ["kind", "resource"]) &&
    typeof input.resource === "object" &&
    input.resource !== null &&
    isCanonicalUuid(input.resource.resourceId) &&
    typeof input.resource.mediaType === "string" &&
    MEDIA_TYPE.test(input.resource.mediaType) &&
    validCount(input.resource.byteLength) &&
    isDigest(input.resource.digest)
  );
};

export const isPortableMediaContent = (
  value: PortableContent | unknown,
): value is PortableMediaContent => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const content = value as Record<string, unknown>;
  if (content.kind === "binary") {
    if (
      !exactKeys(content, ["kind", "mediaType", "encoding", "data", "byteLength", "digest"]) ||
      typeof content.mediaType !== "string" ||
      !MEDIA_TYPE.test(content.mediaType) ||
      content.encoding !== "base64" ||
      typeof content.data !== "string" ||
      !BASE64.test(content.data) ||
      !Number.isSafeInteger(content.byteLength) ||
      Number(content.byteLength) < 0 ||
      !isDigest(content.digest)
    ) {
      return false;
    }
    return (
      Math.floor((content.data.length * 3) / 4) -
        (content.data.endsWith("==") ? 2 : content.data.endsWith("=") ? 1 : 0) ===
      content.byteLength
    );
  }
  const resource = content.resource as Record<string, unknown> | undefined;
  return (
    content.kind === "media-ref" &&
    exactKeys(content, ["kind", "mediaType", "resource", "altText"]) &&
    typeof content.mediaType === "string" &&
    MEDIA_TYPE.test(content.mediaType) &&
    resource !== undefined &&
    isCanonicalUuid(resource.resourceId) &&
    resource.mediaType === content.mediaType &&
    Number.isSafeInteger(resource.byteLength) &&
    Number(resource.byteLength) >= 0 &&
    isDigest(resource.digest) &&
    (content.altText === undefined || typeof content.altText === "string")
  );
};

export const validateImageGenerationRequest = (
  request: ImageGenerationRequest,
): ImageGenerationRequest => {
  if (
    !exactKeys(request, [
      "prompt",
      "count",
      "size",
      "aspectRatio",
      "seed",
      "sourceImages",
      "mask",
    ]) ||
    (request.prompt !== undefined &&
      (typeof request.prompt !== "string" || request.prompt.length === 0)) ||
    !validCount(request.count) ||
    (request.size !== undefined && typeof request.size !== "string") ||
    (request.aspectRatio !== undefined && typeof request.aspectRatio !== "string") ||
    (request.seed !== undefined && !Number.isSafeInteger(request.seed)) ||
    (request.sourceImages !== undefined &&
      (!Array.isArray(request.sourceImages) || !request.sourceImages.every(isLiveMediaInput))) ||
    (request.mask !== undefined && !isLiveMediaInput(request.mask))
  ) {
    throw new TypeError("Image generation requires closed valid portable and live inputs.");
  }
  return request;
};

export const validateSpeechGenerationRequest = (
  request: SpeechGenerationRequest,
): SpeechGenerationRequest => {
  if (
    !exactKeys(request, ["text", "voice", "outputFormat", "instructions", "speed", "language"]) ||
    typeof request.text !== "string" ||
    request.text.length === 0 ||
    typeof request.outputFormat !== "string" ||
    request.outputFormat.length === 0 ||
    (request.voice !== undefined && typeof request.voice !== "string") ||
    (request.instructions !== undefined && typeof request.instructions !== "string") ||
    (request.language !== undefined && typeof request.language !== "string") ||
    (request.speed !== undefined && (!Number.isFinite(request.speed) || request.speed <= 0))
  ) {
    throw new TypeError("Speech generation requires text, format and valid controls.");
  }
  return request;
};

const validExtensions = (value: { extensions?: unknown }): boolean =>
  value.extensions === undefined || isNativeExtensions(value.extensions);

const validUsage = (value: ImageGenerationResult["usage"]): boolean =>
  value === undefined ||
  (exactKeys(value, ["inputTokens", "outputTokens", "totalTokens"]) &&
    Object.values(value).every(
      (count) => count === undefined || (Number.isSafeInteger(count) && Number(count) >= 0),
    ));

export const registerImageGenerationResult = (
  value: ImageGenerationResult,
): ImageGenerationResult => {
  if (
    !exactKeys(value, ["images", "usage", "extensions"]) ||
    !Array.isArray(value.images) ||
    value.images.length === 0 ||
    !value.images.every(isPortableMediaContent) ||
    !validUsage(value.usage) ||
    !validExtensions(value)
  ) {
    throw new TypeError("Image generation returned malformed or non-portable content.");
  }
  return deepFreeze(structuredClone(value));
};

export const registerSpeechGenerationResult = (
  value: SpeechGenerationResult,
): SpeechGenerationResult => {
  if (
    !exactKeys(value, ["audio", "extensions"]) ||
    !isPortableMediaContent(value.audio) ||
    !validExtensions(value)
  ) {
    throw new TypeError("Speech generation returned malformed or non-portable content.");
  }
  return deepFreeze(structuredClone(value));
};

export const registerTranscriptionResult = (value: TranscriptionResult): TranscriptionResult => {
  if (
    !exactKeys(value, ["text", "segments", "language", "durationSeconds", "extensions"]) ||
    typeof value.text !== "string" ||
    !Array.isArray(value.segments) ||
    !value.segments.every(
      (segment) =>
        exactKeys(segment, ["text", "startSecond", "endSecond"]) &&
        typeof segment.text === "string" &&
        Number.isFinite(segment.startSecond) &&
        Number.isFinite(segment.endSecond) &&
        segment.startSecond >= 0 &&
        segment.endSecond >= segment.startSecond,
    ) ||
    (value.durationSeconds !== undefined &&
      (!Number.isFinite(value.durationSeconds) || value.durationSeconds < 0)) ||
    (value.language !== undefined && typeof value.language !== "string") ||
    !validExtensions(value)
  ) {
    throw new TypeError("Transcription returned malformed portable content.");
  }
  return deepFreeze(structuredClone(value));
};
