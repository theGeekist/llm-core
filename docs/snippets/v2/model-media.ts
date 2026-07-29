import {
  createBuiltinModel,
  type ImageGenerationPort,
  type ModelRequest,
  type TranscriptionPort,
} from "@geekist/llm-core/model";
import { newCoreId, type InvocationContext, type InvocationId } from "@geekist/llm-core/contracts";

const context: InvocationContext = {
  invocationId: newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000002410"),
};
const request: ModelRequest = {
  messages: [{ role: "user", content: [{ kind: "text", text: "hello" }] }],
};

const response = await createBuiltinModel().generate(request, context);

declare const images: ImageGenerationPort;
declare const transcription: TranscriptionPort;

await images.generate({ prompt: "A contour map", count: 1 }, context);
await transcription.transcribe(
  { audio: { kind: "bytes", mediaType: "audio/wav", bytes: new Uint8Array() } },
  context,
);

void response;
