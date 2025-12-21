// References: docs/stage-8.md (adapter validation helpers)

import type { AdapterBundle } from "../adapters/types";

export type AdapterKey = keyof AdapterBundle;

const hasListItems = (values: unknown[] | undefined) => (values ? values.length > 0 : false);

export const hasAdapter = (adapters: AdapterBundle | undefined, key: AdapterKey) => {
  if (!adapters) {
    return false;
  }
  const value = adapters[key];
  if (value === undefined || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return hasListItems(value);
  }
  return true;
};

export const validateAdapters = (adapters: AdapterBundle | undefined, required: AdapterKey[]) =>
  required.filter((key) => !hasAdapter(adapters, key));
