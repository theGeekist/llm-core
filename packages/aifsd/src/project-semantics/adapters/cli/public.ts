import type { ProjectResult } from "../../public.js";
import {
  dispatchHeadlessWorkbenchWire,
  type HeadlessWorkbenchDeliveryDependencies,
  type HeadlessWorkbenchOperationReceipt,
  type HeadlessWorkbenchWireOperation,
} from "../../../application/headless-workbench/public.js";

export interface HeadlessWorkbenchCli {
  readonly execute: (
    json: string,
  ) => Promise<{ readonly exitCode: 0 | 1; readonly output: string }>;
}

export interface HeadlessWorkbenchCliDependencies extends HeadlessWorkbenchDeliveryDependencies {
  readonly authorise?: (operation: HeadlessWorkbenchWireOperation) => boolean;
}

const malformed = (): ProjectResult<HeadlessWorkbenchWireOperation> => ({
  ok: false,
  diagnostics: [{ code: "invalid-observation", reasonCode: "required-field-missing" }],
});

const parse = (json: string): ProjectResult<HeadlessWorkbenchWireOperation> => {
  try {
    const value = JSON.parse(json) as unknown;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value: value as HeadlessWorkbenchWireOperation }
      : malformed();
  } catch {
    return malformed();
  }
};

const render = (result: ProjectResult<HeadlessWorkbenchOperationReceipt>): string =>
  JSON.stringify(result);

const denied = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
});

const observeNativePromiseRejection = (value: unknown): void => {
  if (value instanceof Promise) {
    void value.catch(() => undefined);
  }
};

const isAuthorised = (
  dependencies: HeadlessWorkbenchCliDependencies,
  operation: HeadlessWorkbenchWireOperation,
): boolean => {
  try {
    const decision: unknown = dependencies.authorise?.(operation);
    observeNativePromiseRejection(decision);
    return decision === true;
  } catch {
    return false;
  }
};

/** JSON in, JSON out. It does not expose Git, shell or graph-query primitives. */
export const createHeadlessWorkbenchCli = (
  dependencies: HeadlessWorkbenchCliDependencies,
): HeadlessWorkbenchCli => ({
  execute: async (json) => {
    const operation = parse(json);
    const result = operation.ok
      ? isAuthorised(dependencies, operation.value)
        ? await dispatchHeadlessWorkbenchWire(dependencies, operation.value)
        : denied()
      : operation;
    return { exitCode: result.ok ? 0 : 1, output: render(result) };
  },
});
