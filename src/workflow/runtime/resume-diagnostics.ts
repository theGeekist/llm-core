import { applyDiagnosticsMode, createResumeDiagnostic, type DiagnosticEntry } from "../diagnostics";

export const createInvalidResumeDiagnostics = (
  buildDiagnostics: DiagnosticEntry[],
  diagnosticsMode: "default" | "strict",
  message: string,
  code: string,
) =>
  applyDiagnosticsMode(
    [...buildDiagnostics, createResumeDiagnostic(message, { code })],
    diagnosticsMode,
  );
