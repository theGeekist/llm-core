import type { AdapterBundle, AdapterResumeResult } from "#adapters/types";
import type { Runtime } from "./types";

export type ResumeOptions = {
  input: unknown;
  runtime?: Runtime;
  adapters?: AdapterBundle;
  providers?: Record<string, string>;
};

export const readResumeOptions = (
  value: AdapterResumeResult,
  runtime: Runtime | undefined,
): ResumeOptions => ({
  input: value.input,
  runtime: (value.runtime as Runtime | undefined) ?? runtime,
  adapters: value.adapters,
  providers: value.providers,
});
