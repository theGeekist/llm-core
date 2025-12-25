import { describe, expect, it } from "bun:test";
import {
  fromAiSdkImageModel,
  fromAiSdkSpeechModel,
  fromAiSdkTranscriptionModel,
  type Blob,
} from "#adapters";
import { asAiSdkImageModel, asAiSdkSpeechModel, asAiSdkTranscriptionModel } from "./helpers";

const makeBlob = (bytes: number[], contentType?: string): Blob => ({
  bytes: new Uint8Array(bytes),
  contentType,
});

describe("Adapter AI SDK media models", () => {
  it("maps AI SDK image models to ImageModel", async () => {
    const model = asAiSdkImageModel({
      specificationVersion: "v2",
      provider: "test",
      modelId: "image-1",
      maxImagesPerCall: 4,
      doGenerate: () =>
        Promise.resolve({
          images: ["aGVsbG8="],
          warnings: [],
          response: { timestamp: new Date(), modelId: "image-1", headers: {} },
        }),
    });
    const adapter = fromAiSdkImageModel(model);
    const result = await adapter.generate({ prompt: "draw", count: 1 });
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.bytes).toBeInstanceOf(Uint8Array);
  });

  it("maps AI SDK speech models to SpeechModel", async () => {
    const model = asAiSdkSpeechModel({
      specificationVersion: "v2",
      provider: "test",
      modelId: "speech-1",
      doGenerate: () =>
        Promise.resolve({
          audio: new Uint8Array([1, 2, 3]),
          warnings: [],
          response: { timestamp: new Date(), modelId: "speech-1", headers: {} },
        }),
    });
    const adapter = fromAiSdkSpeechModel(model);
    const result = await adapter.generate({ text: "hello", outputFormat: "wav" });
    expect(result.audio.bytes).toBeInstanceOf(Uint8Array);
  });

  it("maps AI SDK transcription models to TranscriptionModel", async () => {
    const model = asAiSdkTranscriptionModel({
      specificationVersion: "v2",
      provider: "test",
      modelId: "transcribe-1",
      doGenerate: () =>
        Promise.resolve({
          text: "hello",
          segments: [],
          language: "en",
          durationInSeconds: 1,
          warnings: [],
          response: { timestamp: new Date(), modelId: "transcribe-1", headers: {} },
        }),
    });
    const adapter = fromAiSdkTranscriptionModel(model);
    const result = await adapter.generate({
      audio: makeBlob([1, 2, 3], "audio/wav"),
    });
    expect(result.text).toBe("hello");
  });
});
