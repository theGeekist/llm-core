import type { JsonValue } from "@geekist/llm-core/contracts";
import type { MaybePromise, ProjectResult } from "../../public.js";
import {
  dispatchHeadlessWorkbenchWire,
  type HeadlessWorkbenchDeliveryDependencies,
  type HeadlessWorkbenchOperationReceipt,
  type HeadlessWorkbenchWireOperation,
} from "../../../application/headless-workbench/public.js";

export const HEADLESS_WORKBENCH_MCP_TOOL = "aifsd.headless-workbench.dispatch";

export interface HeadlessWorkbenchMcpAuthorizer {
  readonly authorise: (
    actorId: string,
    operation: HeadlessWorkbenchWireOperation,
  ) => MaybePromise<boolean>;
}

export interface HeadlessWorkbenchMcp {
  readonly callTool: (
    toolName: string,
    actorId: string,
    arguments_: JsonValue,
  ) => Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>>;
  readonly tools: () => readonly string[];
}

const denied = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
});

const malformed = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "invalid-observation", reasonCode: "required-field-missing" }],
});

const isAuthorised = async (
  authorizer: HeadlessWorkbenchMcpAuthorizer,
  actorId: string,
  operation: HeadlessWorkbenchWireOperation,
): Promise<boolean> => {
  try {
    return (await authorizer.authorise(actorId, operation)) === true;
  } catch {
    return false;
  }
};

/**
 * A controlled MCP binding over the shared dispatcher. No generic Cypher,
 * journal append or arbitrary command tool is available through this adapter.
 */
export const createHeadlessWorkbenchMcp = (
  dependencies: HeadlessWorkbenchDeliveryDependencies,
  authorizer: HeadlessWorkbenchMcpAuthorizer,
): HeadlessWorkbenchMcp => ({
  tools: () => [HEADLESS_WORKBENCH_MCP_TOOL],
  callTool: async (toolName, actorId, arguments_) => {
    if (toolName !== HEADLESS_WORKBENCH_MCP_TOOL) return malformed();
    if (arguments_ === null || typeof arguments_ !== "object" || Array.isArray(arguments_)) {
      return malformed();
    }
    const operation = arguments_ as HeadlessWorkbenchWireOperation;
    return (await isAuthorised(authorizer, actorId, operation))
      ? dispatchHeadlessWorkbenchWire(dependencies, operation)
      : denied();
  },
});
