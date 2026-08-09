import type { JsonValue } from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type { ExecutableTool, ExecuteControlledToolInput, ToolCall } from "../../../tools/runtime";
import type {
  ReadResourceResult,
  ServerNotifier,
  ToolAnnotations,
} from "@modelcontextprotocol/server";

export const MCP_PROTOCOL_VERSION = "2026-07-28" as const;
export const MCP_SERVER_SDK_VERSION = "2.0.0" as const;
export const MCP_CLIENT_SDK_VERSION = "2.0.0" as const;

export interface McpPrincipal {
  readonly id: string;
  readonly scopes: readonly string[];
  readonly attributes?: JsonValue;
}

export type McpAuthorisedOperation =
  | "server.discover"
  | "tools.list"
  | "tools.call"
  | "resources.list"
  | "resources.templates.list"
  | "resources.read"
  | "subscriptions.listen"
  | "legacy.stateless";

export interface McpAuthorisationRequest {
  readonly principal: McpPrincipal;
  readonly operation: McpAuthorisedOperation;
  readonly target?: string;
}

export interface McpAuthenticationRequest {
  readonly request: Request;
  readonly authorization: string | null;
}

export interface McpInvocationContext {
  readonly principal: McpPrincipal;
  readonly requestId: string | number;
  readonly signal: AbortSignal;
}

export interface McpToolDefinition {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly outputSchema?: JsonValue;
  readonly annotations?: ToolAnnotations;
}

export type McpControlledToolExecutionInput = Omit<
  ExecuteControlledToolInput,
  "tool" | "call" | "executionControl"
> & {
  readonly call: ToolCall;
};

export interface McpToolBinding {
  readonly definition: McpToolDefinition;
  /** A registered kernel tool. Its registered schema is the MCP input schema. */
  readonly tool: ExecutableTool;
  /**
   * Application-owned binding for stable lifecycle identity and the policy,
   * approval, journal, receipt and evidence ports of this exact invocation.
   * The adapter supplies the registered tool and transport cancellation port.
   */
  prepareControlledExecution(
    input: McpInvocationContext & { readonly arguments: JsonValue },
  ): MaybePromise<McpControlledToolExecutionInput>;
}

export interface McpResourceDefinition {
  readonly name: string;
  readonly uri: string;
  readonly title?: string;
  readonly description?: string;
  readonly mimeType?: string;
}

export interface McpResourceBinding {
  readonly definition: McpResourceDefinition;
  read(input: McpInvocationContext & { readonly uri: string }): MaybePromise<ReadResourceResult>;
}

export interface McpStatelessHostDefinition {
  readonly name: string;
  readonly version: string;
  readonly tools: readonly McpToolBinding[];
  readonly resources: readonly McpResourceBinding[];
  readonly legacy?: "reject" | "stateless";
  authenticate(input: McpAuthenticationRequest): MaybePromise<McpPrincipal | null>;
  authorise(input: McpAuthorisationRequest): MaybePromise<boolean>;
}

export interface McpStatelessHost {
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
  readonly notify: ServerNotifier;
}

export type McpOperationDisposition = "supported" | "unsupported" | "not-applicable";

export interface McpOperationDeclaration {
  readonly operation: string;
  readonly disposition: McpOperationDisposition;
  readonly protocolVersion: typeof MCP_PROTOCOL_VERSION;
  readonly serverSdkVersion: typeof MCP_SERVER_SDK_VERSION;
  readonly clientSdkVersion: typeof MCP_CLIENT_SDK_VERSION;
  readonly fixture: string;
}
