import type { AdapterBundle } from "../adapters/types";
import type { Runtime } from "./types";
import type { DiagnosticEntry } from "../shared/diagnostics";
import { createResumeDiagnostic } from "../shared/diagnostics";
import { isRecord } from "../shared/guards";

export type ResumeOptions = {
  input: unknown;
  runtime?: Runtime;
  adapters?: AdapterBundle;
  providers?: Record<string, string>;
};

const resumeEnvelopeKeys = new Set(["input", "runtime", "adapters", "providers"]);

const hasOnlyResumeKeys = (value: Record<string, unknown>) =>
  Object.keys(value).every((key) => resumeEnvelopeKeys.has(key));

const isResumeEnvelope = (value: Record<string, unknown>) =>
  "input" in value && hasOnlyResumeKeys(value);

export const readResumeOptions = (
  value: unknown,
  runtime: Runtime | undefined,
  diagnostics?: DiagnosticEntry[],
): ResumeOptions => {
  if (isRecord(value) && isResumeEnvelope(value)) {
    const typed = value as {
      input?: unknown;
      runtime?: Runtime;
      adapters?: AdapterBundle;
      providers?: Record<string, string>;
    };
    return {
      input: typed.input,
      runtime: typed.runtime ?? runtime,
      adapters: typed.adapters,
      providers: typed.providers,
    };
  }
  if (isRecord(value)) {
    if ("input" in value) {
      diagnostics?.push(
        createResumeDiagnostic(
          "Resume adapter returned an object with extra keys; treating it as input.",
        ),
      );
    } else {
      diagnostics?.push(
        createResumeDiagnostic(
          "Resume adapter returned an object without an input; treating it as input.",
        ),
      );
    }
  }
  return { input: value, runtime, adapters: undefined };
};
