/* eslint-disable sonarjs/no-invariant-returns */
import type { AdapterBundle } from "../types";
import { isAdapterBundleKey } from "../bundle";
type AdapterConstructName = keyof AdapterBundle | string;
export type RegistryState = {
  adapters: AdapterBundle;
  diagnostics: import("../types").AdapterDiagnostic[];
  providers: Record<string, string>;
  constructs: Record<string, unknown>;
};

export const createState = (
  diagnostics: import("../types").AdapterDiagnostic[],
): RegistryState => ({
  adapters: {},
  diagnostics: [...diagnostics],
  providers: {},
  constructs: {},
});

// eslint-disable-next-line sonarjs/no-invariant-returns
export const addAdapterValue = (
  state: RegistryState,
  construct: AdapterConstructName,
  value: unknown,
) => {
  if (isAdapterBundleKey(construct)) {
    const bundle = state.adapters as Record<string, unknown>;
    bundle[construct] = value;
    return null;
  }
  state.constructs[construct] = value;
  return null;
};
