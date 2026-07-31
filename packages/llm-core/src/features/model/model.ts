import type { InvocationContext } from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type { ModelContentPart } from "./content";
import type { ModelProfile } from "./profile";
import type { ModelRequest } from "./request";
import type { FinishReason, ModelError, ModelResponse, ModelUsage } from "./response";

/**
 * The model port. Its unary input keeps `InvocationContext` structurally
 * separate from the portable `ModelRequest` (ADR-004), so authority never
 * leaks into model payloads while every operation has one evolvable boundary.
 */
export interface Model {
  readonly profile: ModelProfile;
  generate(input: ModelGenerateInput): MaybePromise<ModelResponse>;
  stream?(input: ModelStreamInput): AsyncIterable<ModelStreamEvent>;
}

export interface ModelGenerateInput {
  readonly request: ModelRequest;
  readonly context: InvocationContext;
}

export interface ModelStreamInput {
  readonly request: ModelRequest;
  readonly context: InvocationContext;
}

/** Streaming projection of a model response. `ToolExecutionEvent` remains canonical. */
export type ModelStreamEvent =
  | { kind: "start" }
  | { kind: "delta"; part: ModelContentPart }
  | { kind: "usage"; usage: ModelUsage }
  | { kind: "finish"; finishReason: FinishReason; usage?: ModelUsage }
  | { kind: "error"; error: ModelError };
