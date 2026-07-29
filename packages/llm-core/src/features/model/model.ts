import type { InvocationContext } from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type { ModelContentPart } from "./content";
import type { ModelProfile } from "./profile";
import type { ModelRequest } from "./request";
import type { FinishReason, ModelError, ModelResponse, ModelUsage } from "./response";

/**
 * The model port. `InvocationContext` is passed as a distinct argument (ADR-004)
 * so identity/authority never leak into the portable `ModelRequest`.
 */
export interface Model {
  readonly profile: ModelProfile;
  generate(request: ModelRequest, context: InvocationContext): MaybePromise<ModelResponse>;
  stream?(request: ModelRequest, context: InvocationContext): AsyncIterable<ModelStreamEvent>;
}

/** Streaming projection of a model response. `ExecutionEvent` remains canonical. */
export type ModelStreamEvent =
  | { kind: "start" }
  | { kind: "delta"; part: ModelContentPart }
  | { kind: "usage"; usage: ModelUsage }
  | { kind: "finish"; finishReason: FinishReason; usage?: ModelUsage }
  | { kind: "error"; error: ModelError };
