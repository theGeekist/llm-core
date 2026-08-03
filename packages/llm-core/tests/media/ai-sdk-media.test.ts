import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { ImageModelV3, SpeechModelV3, TranscriptionModelV3 } from "@ai-sdk/provider";
import { digest, newCoreId, type InvocationId, type ResourceId } from "#contracts";
import {
  isPortableMediaContent,
  registerImageGenerationResult,
} from "../../src/features/media/public";
import {
  fromAiSdkImageModel,
  fromAiSdkSpeechModel,
  fromAiSdkTranscriptionModel,
} from "../../src/adapters/ai-sdk";
import type { MediaOutputProjector, MediaResourceResolver } from "../../src/features/media/public";

const bytesDigest = (bytes: Uint8Array) => digest(createHash("sha256").update(bytes).digest("hex"));
const CONTEXT = {
  invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789d20"),
};
let lastOutputContext: typeof CONTEXT | undefined;
let lastResourceContext: typeof CONTEXT | undefined;

const output: MediaOutputProjector = {
  project: ({ mediaType, bytes, context }) => {
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
  resolve: ({ context }) => {
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
    const result = await adapter.generate({
      request: {
        prompt: "draw",
        count: 2,
        sourceImages: [
          { kind: "bytes", mediaType: "image/jpeg", bytes: new Uint8Array([1]) },
          { kind: "resource", resource },
        ],
        mask: { kind: "bytes", mediaType: "image/png", bytes: new Uint8Array([2]) },
      },
      context: CONTEXT,
    });

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
      }).generate({ request: { prompt: "draw", count: 2 }, context: CONTEXT }),
    ).rejects.toThrow("AI SDK image generation failed");

    const throwing = {
      ...partial,
      doGenerate: () => Promise.reject(new Error("credential sk-secret")),
    } as ImageModelV3;
    await expect(
      fromAiSdkImageModel(throwing, {
        generatedMediaType: "image/png",
        output,
      }).generate({ request: { prompt: "draw", count: 1 }, context: CONTEXT }),
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
      adapter.generate({ request: { text: "hello", outputFormat: "wav" }, context: CONTEXT }),
    ).resolves.toMatchObject({
      audio: { kind: "binary", mediaType: "audio/wav", byteLength: 2 },
    });
    await expect(
      adapter.generate({
        request: { text: "hello", outputFormat: "native-special" },
        context: CONTEXT,
      }),
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
      fromAiSdkTranscriptionModel(model, { resources }).transcribe({
        request: {
          audio: { kind: "resource", resource: audioResource },
        },
        context: CONTEXT,
      }),
    ).rejects.toThrow("AI SDK transcription failed");
    expect(audio).toEqual(new Uint8Array([7, 8, 9]));
  });

  test("verifies binary and nested resource integrity with exact keys", () => {
    expect(
      isPortableMediaContent({
        kind: "binary",
        mediaType: "image/png",
        encoding: "base64",
        data: "AQID",
        byteLength: 3,
        digest: digest("0".repeat(64)),
      }),
    ).toBe(false);
    expect(() =>
      registerImageGenerationResult({
        images: [
          {
            kind: "media-ref",
            mediaType: "image/png",
            resource: {
              ...resource,
              digest: bytesDigest(new Uint8Array([7, 8, 9])),
              localPath: "/workspace/private",
            },
          } as never,
        ],
      }),
    ).toThrow("malformed");
  });

  test("rejects resource digest mismatches and undeclared nested fields before provider use", async () => {
    let calls = 0;
    const model = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "image",
      maxImagesPerCall: 1,
      doGenerate: () => {
        calls += 1;
        return Promise.resolve({
          images: [new Uint8Array([1])],
          warnings: [],
          response: { timestamp: new Date(), modelId: "image", headers: undefined },
        });
      },
    } as ImageModelV3;
    const wrongResources: MediaResourceResolver = {
      resolve: () => new Uint8Array([7, 8, 8]),
    };
    await expect(
      fromAiSdkImageModel(model, {
        generatedMediaType: "image/png",
        output,
        resources: wrongResources,
      }).generate({
        request: {
          count: 1,
          sourceImages: [{ kind: "resource", resource }],
        },
        context: CONTEXT,
      }),
    ).rejects.toThrow("failed");
    expect(calls).toBe(0);

    await expect(
      fromAiSdkImageModel(model, {
        generatedMediaType: "image/png",
        output,
        resources,
      }).generate({
        request: {
          count: 1,
          sourceImages: [
            {
              kind: "resource",
              resource: { ...resource, localPath: "/workspace/private" },
            } as never,
          ],
        },
        context: CONTEXT,
      }),
    ).rejects.toThrow("closed valid");
    expect(calls).toBe(0);
  });

  test("rejects projector byte substitution and safely projects provider identifiers", async () => {
    const model = {
      specificationVersion: "v3",
      provider: "https://placeholder.invalid/provider",
      modelId: "speech",
      doGenerate: () =>
        Promise.resolve({
          audio: new Uint8Array([1, 2]),
          warnings: [],
          response: { timestamp: new Date(), modelId: "/workspace/private-model" },
        }),
    } as SpeechModelV3;
    const substitutingOutput: MediaOutputProjector = {
      project: ({ mediaType }) => {
        const replacement = new Uint8Array([9, 9]);
        return {
          kind: "binary",
          mediaType,
          encoding: "base64",
          data: Buffer.from(replacement).toString("base64"),
          byteLength: replacement.byteLength,
          digest: bytesDigest(replacement),
        };
      },
    };
    await expect(
      fromAiSdkSpeechModel(model, { output: substitutingOutput }).generate({
        request: { text: "hello", outputFormat: "wav" },
        context: CONTEXT,
      }),
    ).rejects.toThrow("failed");

    const result = await fromAiSdkSpeechModel(model, { output }).generate({
      request: { text: "hello", outputFormat: "wav" },
      context: CONTEXT,
    });
    expect(result.extensions).toEqual({
      "dev.vercel.ai-sdk": {
        provider: "[redacted]",
        modelId: "[redacted]",
        warningCount: 0,
      },
    });
    expect(JSON.stringify(result)).not.toContain("placeholder.invalid");
    expect(JSON.stringify(result)).not.toContain("/workspace/private-model");
  });
});
