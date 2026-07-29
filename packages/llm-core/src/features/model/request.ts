import type { JsonValue, NativeExtensions, SchemaRef } from "#contracts";
import type { ModelMessage } from "./content";

/**
 * Neutral model request (ADR-004). Framework/provider types never appear here.
 * `InvocationContext` is passed separately to the model operation, not embedded.
 */

/**
 * A tool the model may call. Parameters are a JSON-Schema-shaped value; the
 * tooling feature will own richer declarations, adopted at convergence.
 */
export interface ToolDeclaration {
  name: string;
  description?: string;
  parameters?: JsonValue;
}

export type ToolChoice =
  | { kind: "auto" }
  | { kind: "none" }
  | { kind: "required" }
  | { kind: "tool"; name: string };

/** Free text, or JSON constrained by an optional published schema identity. */
export type ResponseFormat = { kind: "text" } | { kind: "json"; schema?: SchemaRef };

export interface SamplingParams {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  seed?: number;
}

/** Redacted provider-native request metadata carried under namespaced extensions. */
export interface ProviderRequestMetadata {
  extensions?: NativeExtensions;
}

export interface ModelRequest {
  messages: ModelMessage[];
  tools?: ToolDeclaration[];
  toolChoice?: ToolChoice;
  responseFormat?: ResponseFormat;
  sampling?: SamplingParams;
  metadata?: ProviderRequestMetadata;
}
