import type { JSONValue, TranscriptionModelV3 } from "@ai-sdk/provider";
import type {
  AdapterCallContext,
  TranscriptionCall,
  TranscriptionModel,
  TranscriptionResult,
} from "../types";
import { bindFirst, fromPromiseLike, mapMaybe } from "../../maybe";
import { toAdapterTrace } from "../telemetry";
import { validateTranscriptionInput } from "../input-validation";
import { toDiagnostics, toMeta, toTelemetry } from "./telemetry";

const toTranscriptionResult = (
  result: Awaited<ReturnType<TranscriptionModelV3["doGenerate"]>>,
  diagnostics: ReturnType<typeof validateTranscriptionInput>,
): TranscriptionResult => {
  const mergedDiagnostics = diagnostics.concat(toDiagnostics(result.warnings));
  const telemetry = toTelemetry({
    request: result.request ? { body: result.request.body } : undefined,
    response: {
      modelId: result.response.modelId,
      timestamp: result.response.timestamp,
      headers: result.response.headers as Record<string, string> | undefined,
      body: result.response.body,
    },
    warnings: result.warnings,
    providerMetadata: result.providerMetadata as Record<string, unknown> | undefined,
  });
  return {
    text: result.text,
    segments: result.segments,
    language: result.language ?? undefined,
    durationSeconds: result.durationInSeconds ?? undefined,
    diagnostics: mergedDiagnostics,
    telemetry,
    trace: toAdapterTrace(telemetry),
    meta: toMeta({ modelId: result.response.modelId }),
    raw: result,
  };
};

const toProviderOptions = (options?: Record<string, Record<string, unknown>>) =>
  (options ?? {}) as Record<string, Record<string, JSONValue>>;

const mapTranscriptionResult = (
  diagnostics: ReturnType<typeof validateTranscriptionInput>,
  result: Awaited<ReturnType<TranscriptionModelV3["doGenerate"]>>,
): TranscriptionResult => toTranscriptionResult(result, diagnostics);

export function fromAiSdkTranscriptionModel(model: TranscriptionModelV3): TranscriptionModel {
  function generate(call: TranscriptionCall, _context?: AdapterCallContext) {
    void _context;
    const diagnostics = validateTranscriptionInput(call.audio);
    return mapMaybe(
      fromPromiseLike(
        model.doGenerate({
          audio: call.audio.bytes,
          mediaType: call.audio.contentType ?? "application/octet-stream",
          providerOptions: toProviderOptions(call.providerOptions),
          headers: call.headers,
          abortSignal: call.abortSignal,
        }),
      ),
      bindFirst(mapTranscriptionResult, diagnostics),
    );
  }

  return { generate };
}
