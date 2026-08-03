import type { ImageModelV3File } from "@ai-sdk/provider";
import type { InvocationContext } from "#contracts";
import {
  isLiveMediaInput,
  mediaBytesDigest,
  registerProjectedMediaContent,
  type LiveMediaInput,
  type MediaOutputProjector,
  type MediaResourceResolver,
  type PortableMediaContent,
} from "../../features/media/public";
import { safeAdapterScalar } from "../shared-native-metadata";

export interface AiSdkMediaAdapterOptions {
  readonly output: MediaOutputProjector;
  readonly resources?: MediaResourceResolver;
}

export const decodeNativeBytes = (value: string | Uint8Array): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value.slice();
  }
  try {
    const decoded = atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new TypeError("AI SDK media returned malformed base64 content.");
  }
};

export const resolveLiveMedia = async (
  input: LiveMediaInput,
  context: InvocationContext,
  resources?: MediaResourceResolver,
): Promise<{ mediaType: string; bytes: Uint8Array }> => {
  if (!isLiveMediaInput(input)) {
    throw new TypeError("Live media inputs must use a closed valid shape.");
  }
  if (input.kind === "bytes") {
    return { mediaType: input.mediaType, bytes: input.bytes.slice() };
  }
  if (!resources) {
    throw new TypeError("Referenced media requires an authorized resource resolver.");
  }
  const bytes = await resources.resolve({
    resource: structuredClone(input.resource),
    context: structuredClone(context),
  });
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength !== input.resource.byteLength ||
    mediaBytesDigest(bytes).value !== input.resource.digest.value
  ) {
    throw new TypeError("Resolved media does not match its declared resource integrity.");
  }
  return { mediaType: input.resource.mediaType, bytes: bytes.slice() };
};

export const toAiSdkFile = async (
  input: LiveMediaInput,
  context: InvocationContext,
  resources?: MediaResourceResolver,
): Promise<ImageModelV3File> => {
  const resolved = await resolveLiveMedia(input, context, resources);
  return { type: "file", mediaType: resolved.mediaType, data: resolved.bytes };
};

export const projectNativeBytes = async (input: {
  readonly value: string | Uint8Array;
  readonly mediaType: string;
  readonly context: InvocationContext;
  readonly output: MediaOutputProjector;
}): Promise<PortableMediaContent> => {
  const bytes = decodeNativeBytes(input.value);
  const source = { mediaType: input.mediaType, bytes: bytes.slice() };
  const projected = await input.output.project({
    mediaType: source.mediaType,
    bytes: source.bytes.slice(),
    context: structuredClone(input.context),
  });
  return registerProjectedMediaContent(projected, source);
};

export const safeAiSdkExtensions = (
  provider: string,
  modelId: string,
  warnings: readonly unknown[],
) => ({
  "dev.vercel.ai-sdk": {
    provider: safeAdapterScalar(provider),
    modelId: safeAdapterScalar(modelId),
    warningCount: warnings.length,
  },
});
