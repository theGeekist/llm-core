import type {
  BinaryContent,
  MediaRefContent,
  NativeExtensions,
  ResourceRef,
  InvocationContext,
} from "#contracts";
import type { MaybePromise } from "#shared/maybe";

export type PortableMediaContent = BinaryContent | MediaRefContent;

export type LiveMediaInput =
  | {
      readonly kind: "bytes";
      readonly mediaType: string;
      readonly bytes: Uint8Array;
    }
  | {
      readonly kind: "resource";
      readonly resource: ResourceRef;
    };

export interface MediaResourceResolver {
  resolve(input: MediaResourceResolveInput): MaybePromise<Uint8Array>;
}

export interface MediaOutputProjector {
  project(input: MediaOutputProjectInput): MaybePromise<PortableMediaContent>;
}

export interface MediaResourceResolveInput {
  readonly resource: ResourceRef;
  readonly context: InvocationContext;
}

export interface MediaOutputProjectInput {
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly context: InvocationContext;
}

export interface ImageGenerationRequest {
  readonly prompt?: string;
  readonly count: number;
  readonly size?: string;
  readonly aspectRatio?: string;
  readonly seed?: number;
  readonly sourceImages?: readonly LiveMediaInput[];
  readonly mask?: LiveMediaInput;
}

export interface ImageGenerationResult {
  readonly images: readonly PortableMediaContent[];
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  };
  readonly extensions?: NativeExtensions;
}

export interface ImageGenerationPort {
  generate(input: ImageGenerationInput): MaybePromise<ImageGenerationResult>;
}

export interface ImageGenerationInput {
  readonly request: ImageGenerationRequest;
  readonly context: InvocationContext;
}

export interface SpeechGenerationRequest {
  readonly text: string;
  readonly voice?: string;
  readonly outputFormat: string;
  readonly instructions?: string;
  readonly speed?: number;
  readonly language?: string;
}

export interface SpeechGenerationResult {
  readonly audio: PortableMediaContent;
  readonly extensions?: NativeExtensions;
}

export interface SpeechGenerationPort {
  generate(input: SpeechGenerationInput): MaybePromise<SpeechGenerationResult>;
}

export interface SpeechGenerationInput {
  readonly request: SpeechGenerationRequest;
  readonly context: InvocationContext;
}

export interface TranscriptionRequest {
  readonly audio: LiveMediaInput;
}

export interface TranscriptionSegment {
  readonly text: string;
  readonly startSecond: number;
  readonly endSecond: number;
}

export interface TranscriptionResult {
  readonly text: string;
  readonly segments: readonly TranscriptionSegment[];
  readonly language?: string;
  readonly durationSeconds?: number;
  readonly extensions?: NativeExtensions;
}

export interface TranscriptionPort {
  transcribe(input: TranscriptionInput): MaybePromise<TranscriptionResult>;
}

export interface TranscriptionInput {
  readonly request: TranscriptionRequest;
  readonly context: InvocationContext;
}
