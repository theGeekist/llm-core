import type {
  AdapterCallContext,
  AdapterDiagnostic,
  AdapterMetadata,
  AdapterTraceEvent,
} from "./core";
import type { ModelMeta, ModelTelemetry, ModelUsage } from "./model";
import type { Blob } from "./storage";
import type { MaybePromise } from "../../maybe";

type ProviderOptions = Record<string, Record<string, unknown>>;
type ProviderHeaders = Record<string, string | undefined>;
type ProviderCallMeta = {
  providerOptions?: ProviderOptions | null;
  headers?: ProviderHeaders | null;
  abortSignal?: AbortSignal | null;
  metadata?: AdapterMetadata | null;
};

type MediaResultBase = {
  diagnostics?: AdapterDiagnostic[] | null;
  telemetry?: ModelTelemetry | null;
  trace?: AdapterTraceEvent[] | null;
  meta?: ModelMeta | null;
  raw?: unknown | null;
};

export type ImageCall = ProviderCallMeta & {
  prompt: string;
  count?: number | null;
  size?: string | null;
  aspectRatio?: string | null;
  seed?: number | null;
};

export type ImageResult = MediaResultBase & {
  images: Blob[];
  usage?: ModelUsage | null;
};

export type ImageModel = {
  generate(call: ImageCall, context?: AdapterCallContext): MaybePromise<ImageResult>;
  metadata?: AdapterMetadata | null;
};

export type SpeechCall = ProviderCallMeta & {
  text: string;
  voice?: string | null;
  outputFormat?: string | null;
  instructions?: string | null;
  speed?: number | null;
  language?: string | null;
};

export type SpeechResult = MediaResultBase & {
  audio: Blob;
};

export type SpeechModel = {
  generate(call: SpeechCall, context?: AdapterCallContext): MaybePromise<SpeechResult>;
  metadata?: AdapterMetadata | null;
};

export type TranscriptionCall = ProviderCallMeta & {
  audio: Blob;
};

export type TranscriptionSegment = {
  text: string;
  startSecond: number;
  endSecond: number;
};

export type TranscriptionResult = MediaResultBase & {
  text: string;
  segments?: TranscriptionSegment[] | null;
  language?: string | null;
  durationSeconds?: number | null;
};

export type TranscriptionModel = {
  generate(
    call: TranscriptionCall,
    context?: AdapterCallContext,
  ): MaybePromise<TranscriptionResult>;
  metadata?: AdapterMetadata | null;
};
