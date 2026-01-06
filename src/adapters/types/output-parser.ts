import type { AdapterCallContext, AdapterMetadata } from "./core";
import type { MaybePromise } from "../../shared/maybe";

export type OutputParser = {
  parse: (text: string, context?: AdapterCallContext) => MaybePromise<unknown>;
  formatInstructions?: (options?: Record<string, unknown>) => MaybePromise<string>;
  metadata?: AdapterMetadata;
};
