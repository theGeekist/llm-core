import type { AdapterDiagnostic } from "./types";

export function warnDiagnostic(message: string, data?: unknown): AdapterDiagnostic {
  return { level: "warn", message, data };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
