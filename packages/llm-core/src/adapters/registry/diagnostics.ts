import type { AdapterDiagnostic } from "../types";

export const registryDiagnostic = (
  level: "warn" | "error",
  code: string,
  data?: Record<string, unknown>,
): AdapterDiagnostic => ({
  level,
  message: code,
  data,
});
