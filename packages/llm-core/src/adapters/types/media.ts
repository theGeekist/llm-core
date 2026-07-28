import type { AdapterDiagnostic, AdapterMetadata, AdapterRequest, AdapterTraceEvent } from "./core";
import type { ModelMeta, ModelTelemetry, ModelUsage } from "./model";
import type { Blob } from "./storage";
import type { MaybePromise } from "#shared/maybe";

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
  generate(request: AdapterRequest<ImageCall>): MaybePromise<ImageResult>;
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
  generate(request: AdapterRequest<SpeechCall>): MaybePromise<SpeechResult>;
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
  generate(request: AdapterRequest<TranscriptionCall>): MaybePromise<TranscriptionResult>;
  metadata?: AdapterMetadata | null;
};
