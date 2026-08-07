// Renderer-neutral configuration diagnostics and strict JSON admission. Neutral
// JSON mechanics remain owned by @geekist/strict-json; this module maps stable
// failures into AIFSD's diagnostic vocabulary and preserves domain freeze timing.

import {
  deepFreeze,
  normalize,
  StrictJsonError,
  type JsonValue as StrictJsonValue,
} from "@geekist/strict-json";
import type { JsonValue } from "@geekist/llm-core/contracts";
import type {
  ConfigurationDiagnostic,
  ConfigurationDiagnosticCode,
  ConfigurationDiagnosticReasonCode,
} from "./contract.js";

export const diagnostic = (
  code: ConfigurationDiagnosticCode,
  reasonCode: ConfigurationDiagnosticReasonCode,
  path?: string,
): ConfigurationDiagnostic =>
  path === undefined ? { code, reasonCode } : { code, reasonCode, path };

/** Shallow record shape used after strict JSON capture has removed live values. */
export const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One configuration diagnostic for each field outside the owning contract. */
export const unexpectedFieldDiagnostics = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  location: string | { readonly path: string; readonly code: ConfigurationDiagnosticCode },
): ConfigurationDiagnostic[] => {
  const { path, code } =
    typeof location === "string" ? { path: location, code: "unknown-field" as const } : location;
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => diagnostic(code, "unexpected-field", `${path}/${key}`));
};

const strictJsonFailure = (
  error: unknown,
): {
  readonly code: ConfigurationDiagnosticCode;
  readonly reasonCode: ConfigurationDiagnosticReasonCode;
} => {
  if (error instanceof StrictJsonError) {
    switch (error.code) {
      case "cyclic-reference":
      case "non-data-property":
      case "non-enumerable-property":
      case "non-plain-object":
      case "symbol-key":
        return { code: "live-object", reasonCode: "live-object" };
      default:
        break;
    }
  }
  return { code: "non-portable-value", reasonCode: "invalid-portable-value" };
};

type ConfigurationValueOutcome =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly diagnostic: ConfigurationDiagnostic };

export const normalizeConfigurationValue = (
  value: unknown,
  path: string,
): ConfigurationValueOutcome => {
  if (value === undefined) {
    return {
      ok: false,
      diagnostic: diagnostic("undefined-value", "undefined-value", path),
    };
  }
  try {
    return { ok: true, value: normalize(value) };
  } catch (error) {
    const failure = strictJsonFailure(error);
    return { ok: false, diagnostic: diagnostic(failure.code, failure.reasonCode, path) };
  }
};

type ConfigurationCapture =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly diagnostics: readonly ConfigurationDiagnostic[] };

/** Detach hostile input without freezing before its owning shape validation. */
export const captureConfigurationData = (input: unknown, path: string): ConfigurationCapture => {
  const normalized = normalizeConfigurationValue(input, path);
  return normalized.ok ? normalized : { ok: false, diagnostics: [normalized.diagnostic] };
};

/** Freeze only after the owning configuration boundary has validated shape. */
export const freezeConfigurationData = <T>(value: T): T =>
  deepFreeze(value as unknown as StrictJsonValue) as unknown as T;
