import type { ImageModelV3File } from "@ai-sdk/provider";
import type { InvocationContext } from "#contracts";
import type {
  LiveMediaInput,
  MediaOutputProjector,
  MediaResourceResolver,
  PortableMediaContent,
} from "../../../../features/media/public";

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
  if (input.kind === "bytes") {
    return { mediaType: input.mediaType, bytes: input.bytes.slice() };
  }
  if (!resources) {
    throw new TypeError("Referenced media requires an authorized resource resolver.");
  }
  const bytes = await resources.resolve(structuredClone(input.resource), structuredClone(context));
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== input.resource.byteLength) {
    throw new TypeError("Resolved media does not match its declared resource length.");
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
}): Promise<PortableMediaContent> =>
  input.output.project(
    { mediaType: input.mediaType, bytes: decodeNativeBytes(input.value) },
    structuredClone(input.context),
  );

export const safeAiSdkExtensions = (
  provider: string,
  modelId: string,
  warnings: readonly unknown[],
) => ({
  "dev.vercel.ai-sdk": {
    provider,
    modelId,
    warningCount: warnings.length,
  },
});
