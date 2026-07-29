import { createHash } from "node:crypto";
import {
  digest,
  isCanonicalUuid,
  isDigest,
  isNativeExtensions,
  type Digest,
  type PortableContent,
  type ResourceRef,
} from "#contracts";
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  LiveMediaInput,
  PortableMediaContent,
  SpeechGenerationRequest,
  SpeechGenerationResult,
  TranscriptionResult,
} from "./types";

const MEDIA_TYPE =
  // eslint-disable-next-line sonarjs/regex-complexity -- mirrors the canonical contract media type syntax
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;
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

const validByteLength = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const sameDigest = (left: Digest, right: Digest): boolean =>
  left.algorithm === right.algorithm && left.value === right.value;

export const mediaBytesDigest = (bytes: Uint8Array): Digest =>
  digest(createHash("sha256").update(bytes).digest("hex"));

export const registerMediaResourceRef = (value: unknown): ResourceRef => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !exactKeys(value, ["resourceId", "mediaType", "byteLength", "digest"])
  ) {
    throw new TypeError("Media resources must use a closed portable reference.");
  }
  const resource = value as Partial<ResourceRef>;
  if (
    !isCanonicalUuid(resource.resourceId) ||
    typeof resource.mediaType !== "string" ||
    !MEDIA_TYPE.test(resource.mediaType) ||
    !validByteLength(resource.byteLength) ||
    !isDigest(resource.digest)
  ) {
    throw new TypeError("Media resources require valid identity, type, length and SHA-256 digest.");
  }
  return deepFreeze(structuredClone(resource)) as ResourceRef;
};

const decodeBase64 = (value: string): Uint8Array | null => {
  if (!BASE64.test(value)) {
    return null;
  }
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

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
  if (input.kind !== "resource" || !exactKeys(value, ["kind", "resource"])) {
    return false;
  }
  try {
    registerMediaResourceRef(input.resource);
    return true;
  } catch {
    return false;
  }
};

export const isPortableMediaContent = (
  value: PortableContent | unknown,
): value is PortableMediaContent => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const content = value as Record<string, unknown>;
  if (content.kind === "binary") {
    const bytes = typeof content.data === "string" ? decodeBase64(content.data) : null;
    if (
      !exactKeys(content, ["kind", "mediaType", "encoding", "data", "byteLength", "digest"]) ||
      typeof content.mediaType !== "string" ||
      !MEDIA_TYPE.test(content.mediaType) ||
      content.encoding !== "base64" ||
      bytes === null ||
      !Number.isSafeInteger(content.byteLength) ||
      Number(content.byteLength) < 0 ||
      !isDigest(content.digest)
    ) {
      return false;
    }
    return (
      bytes.byteLength === content.byteLength && sameDigest(mediaBytesDigest(bytes), content.digest)
    );
  }
  if (
    content.kind !== "media-ref" ||
    !exactKeys(content, ["kind", "mediaType", "resource", "altText"]) ||
    typeof content.mediaType !== "string" ||
    !MEDIA_TYPE.test(content.mediaType) ||
    (content.altText !== undefined && typeof content.altText !== "string")
  ) {
    return false;
  }
  try {
    return registerMediaResourceRef(content.resource).mediaType === content.mediaType;
  } catch {
    return false;
  }
};

export const registerProjectedMediaContent = (
  value: unknown,
  source: { readonly mediaType: string; readonly bytes: Uint8Array },
): PortableMediaContent => {
  if (!isPortableMediaContent(value)) {
    throw new TypeError("Projected media must be closed portable content with verified integrity.");
  }
  const expectedDigest = mediaBytesDigest(source.bytes);
  const identity = value.kind === "binary" ? value : value.resource;
  if (
    value.mediaType !== source.mediaType ||
    identity.mediaType !== source.mediaType ||
    identity.byteLength !== source.bytes.byteLength ||
    !sameDigest(identity.digest, expectedDigest)
  ) {
    throw new TypeError("Projected media must identify the exact source bytes and media type.");
  }
  return deepFreeze(structuredClone(value));
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
