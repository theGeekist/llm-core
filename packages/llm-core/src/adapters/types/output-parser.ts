import type { AdapterMetadata, AdapterRequest } from "./core";
import type { MaybePromise } from "#shared/maybe";

export type OutputParser = {
  parse: (request: AdapterRequest<{ text: string }>) => MaybePromise<unknown>;
  formatInstructions?: (options?: Record<string, unknown>) => MaybePromise<string>;
  metadata?: AdapterMetadata;
};
