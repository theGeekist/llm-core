import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { ImageModelV3, SpeechModelV3, TranscriptionModelV3 } from "@ai-sdk/provider";
import { digest, newCoreId, type InvocationId, type ResourceId } from "#contracts";
import {
  fromAiSdkImageModel,
  fromAiSdkSpeechModel,
  fromAiSdkTranscriptionModel,
} from "../../src/adapters/providers/ai-sdk/media/public";
import type { MediaOutputProjector, MediaResourceResolver } from "../../src/features/media/public";

const bytesDigest = (bytes: Uint8Array) => digest(createHash("sha256").update(bytes).digest("hex"));
const CONTEXT = {
  invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789d20"),
};
let lastOutputContext: typeof CONTEXT | undefined;
let lastResourceContext: typeof CONTEXT | undefined;

const output: MediaOutputProjector = {
  project: ({ mediaType, bytes }, context) => {
    lastOutputContext = context;
    return {
      kind: "binary",
      mediaType,
      encoding: "base64",
      data: Buffer.from(bytes).toString("base64"),
      byteLength: bytes.byteLength,
      digest: bytesDigest(bytes),
    };
  },
};

const resource = {
  resourceId: newCoreId<ResourceId>("018f0f4e-8c5b-7a91-8c3b-123456789d21"),
  mediaType: "image/png",
  byteLength: 3,
  digest: bytesDigest(new Uint8Array([7, 8, 9])),
};
const resources: MediaResourceResolver = {
  resolve: (_resource, context) => {
    lastResourceContext = context;
    return new Uint8Array([7, 8, 9]);
  },
};

describe("AI SDK v3 media adapters", () => {
  test("projects multipart image bytes without native metadata leakage", async () => {
    const native = new Uint8Array([1, 2, 3]);
    let call: Parameters<ImageModelV3["doGenerate"]>[0] | undefined;
    const model = {
      specificationVersion: "v3",
      provider: "test-provider",
      modelId: "image-model",
      maxImagesPerCall: 4,
      doGenerate: (request: Parameters<ImageModelV3["doGenerate"]>[0]) => {
        call = request;
        return Promise.resolve({
          images: [native, "BAUG"],
          warnings: [{ type: "other", message: "signed https://secret.test" }],
          providerMetadata: {
            test: { images: [], credential: "sk-native" },
          },
          response: {
            timestamp: new Date(),
            modelId: "image-model",
            headers: { authorization: "Bearer secret" },
          },
        });
      },
    } as ImageModelV3;
    const adapter = fromAiSdkImageModel(model, {
      generatedMediaType: "image/png",
      output,
      resources,
    });
    const result = await adapter.generate(
      {
        prompt: "draw",
        count: 2,
        sourceImages: [
          { kind: "bytes", mediaType: "image/jpeg", bytes: new Uint8Array([1]) },
          { kind: "resource", resource },
        ],
        mask: { kind: "bytes", mediaType: "image/png", bytes: new Uint8Array([2]) },
      },
      CONTEXT,
    );

    expect(call?.files).toHaveLength(2);
    expect(call?.mask?.type).toBe("file");
    expect(lastResourceContext).toEqual(CONTEXT);
    expect(lastOutputContext).toEqual(CONTEXT);
    expect(result.images).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("sk-native");
    expect(JSON.stringify(result)).not.toContain("secret.test");
    native[0] = 99;
    expect(result.images[0]).toMatchObject({ kind: "binary", data: "AQID" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("fails closed on partial images and redacts native errors", async () => {
    const partial = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "image",
      maxImagesPerCall: 2,
      doGenerate: () =>
        Promise.resolve({
          images: [new Uint8Array([1])],
          warnings: [],
          response: { timestamp: new Date(), modelId: "image", headers: undefined },
        }),
    } as unknown as ImageModelV3;
    await expect(
      fromAiSdkImageModel(partial, {
        generatedMediaType: "image/png",
        output,
      }).generate({ prompt: "draw", count: 2 }, CONTEXT),
    ).rejects.toThrow("AI SDK image generation failed");

    const throwing = {
      ...partial,
      doGenerate: () => Promise.reject(new Error("credential sk-secret")),
    } as ImageModelV3;
    await expect(
      fromAiSdkImageModel(throwing, {
        generatedMediaType: "image/png",
        output,
      }).generate({ prompt: "draw", count: 1 }, CONTEXT),
    ).rejects.not.toThrow("sk-secret");
  });

  test("projects speech and rejects formats with semantic loss", async () => {
    const model = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "speech",
      doGenerate: () =>
        Promise.resolve({
          audio: new Uint8Array([1, 2]),
          warnings: [],
          response: { timestamp: new Date(), modelId: "speech" },
        }),
    } as SpeechModelV3;
    const adapter = fromAiSdkSpeechModel(model, { output });
    await expect(
      adapter.generate({ text: "hello", outputFormat: "wav" }, CONTEXT),
    ).resolves.toMatchObject({
      audio: { kind: "binary", mediaType: "audio/wav", byteLength: 2 },
    });
    await expect(
      adapter.generate({ text: "hello", outputFormat: "native-special" }, CONTEXT),
    ).rejects.toThrow("lossless");
  });

  test("resolves transcription resources and rejects malformed segments", async () => {
    let audio: Uint8Array | string | undefined;
    const model = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "transcribe",
      doGenerate: (request: Parameters<TranscriptionModelV3["doGenerate"]>[0]) => {
        audio = request.audio;
        return Promise.resolve({
          text: "hello",
          segments: [{ text: "hello", startSecond: 0, endSecond: -1 }],
          language: "en",
          durationInSeconds: 1,
          warnings: [],
          response: { timestamp: new Date(), modelId: "transcribe" },
        });
      },
    } as TranscriptionModelV3;
    const audioResource = {
      ...resource,
      mediaType: "audio/wav",
      digest: bytesDigest(new Uint8Array([7, 8, 9])),
    };
    await expect(
      fromAiSdkTranscriptionModel(model, { resources }).transcribe(
        {
          audio: { kind: "resource", resource: audioResource },
        },
        CONTEXT,
      ),
    ).rejects.toThrow("AI SDK transcription failed");
    expect(audio).toEqual(new Uint8Array([7, 8, 9]));
  });
});
