import type { AdapterDiagnostic } from "./types";

export function warnDiagnostic(message: string, data?: unknown): AdapterDiagnostic {
  return { level: "warn", message, data };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
