import type { AdapterCallContext } from "#adapters/types";
import { attachAdapterContext, type AdapterContextOptions } from "./adapter-context-retry";
import { createAdapterDiagnostic } from "#shared/diagnostics";
import type { DiagnosticEntry } from "#shared/reporting";

const createContextState = () => {
  const diagnostics: DiagnosticEntry[] = [];
  const context: AdapterCallContext = {
    report: (diagnostic) => {
      diagnostics.push(createAdapterDiagnostic(diagnostic));
    },
  };
  return { context, diagnostics };
};

export const createAdapterContext = () => createContextState();

export { attachAdapterContext };
export type { AdapterContextOptions };
