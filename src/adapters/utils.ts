import type { AdapterDiagnostic } from "./types";
import { isRecord as isSharedRecord, isString } from "../shared/guards";

export function warnDiagnostic(message: string, data?: unknown): AdapterDiagnostic {
  return { level: "warn", message, data };
}

export const isRecord = isSharedRecord;

export function readString(value: unknown): string | null {
  return isString(value) ? value : null;
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
