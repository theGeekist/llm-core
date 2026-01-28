import { createResumeDiagnostic } from "#shared/diagnostics";
import { applyDiagnosticsMode, type DiagnosticEntry } from "#shared/reporting";

type InvalidResumeDiagnosticsInput = {
  buildDiagnostics: DiagnosticEntry[];
  diagnosticsMode: "default" | "strict";
  message: string;
  code: string;
};

export const createInvalidResumeDiagnostics = (input: InvalidResumeDiagnosticsInput) =>
  applyDiagnosticsMode(
    [...input.buildDiagnostics, createResumeDiagnostic(input.message, { code: input.code })],
    input.diagnosticsMode,
  );
