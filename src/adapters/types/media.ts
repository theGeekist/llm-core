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
  providerOptions?: ProviderOptions;
  headers?: ProviderHeaders;
  abortSignal?: AbortSignal;
  metadata?: AdapterMetadata;
};

type MediaResultBase = {
  diagnostics?: AdapterDiagnostic[];
  telemetry?: ModelTelemetry;
  trace?: AdapterTraceEvent[];
  meta?: ModelMeta;
  raw?: unknown;
};

export type ImageCall = ProviderCallMeta & {
  prompt: string;
  count?: number;
  size?: string;
  aspectRatio?: string;
  seed?: number;
};

export type ImageResult = MediaResultBase & {
  images: Blob[];
  usage?: ModelUsage;
};

export type ImageModel = {
  generate(call: ImageCall, context?: AdapterCallContext): MaybePromise<ImageResult>;
};

export type SpeechCall = ProviderCallMeta & {
  text: string;
  voice?: string;
  outputFormat?: string;
  instructions?: string;
  speed?: number;
  language?: string;
};

export type SpeechResult = MediaResultBase & {
  audio: Blob;
};

export type SpeechModel = {
  generate(call: SpeechCall, context?: AdapterCallContext): MaybePromise<SpeechResult>;
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
  segments?: TranscriptionSegment[];
  language?: string;
  durationSeconds?: number;
};

export type TranscriptionModel = {
  generate(
    call: TranscriptionCall,
    context?: AdapterCallContext,
  ): MaybePromise<TranscriptionResult>;
};
