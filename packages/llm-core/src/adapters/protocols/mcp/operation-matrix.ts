import {
  MCP_CLIENT_SDK_VERSION,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_SDK_VERSION,
  type McpOperationDeclaration,
} from "./types";

const operation = (
  name: string,
  disposition: McpOperationDeclaration["disposition"],
  fixture: string,
): McpOperationDeclaration =>
  Object.freeze({
    operation: name,
    disposition,
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverSdkVersion: MCP_SERVER_SDK_VERSION,
    clientSdkVersion: MCP_CLIENT_SDK_VERSION,
    fixture,
  });

export const MCP_OPERATION_MATRIX: readonly McpOperationDeclaration[] = Object.freeze([
  operation("mcp.server.discover", "supported", "#supports-discovery-per-request"),
  operation("mcp.tools.list", "supported", "#lists-tools-deterministically"),
  operation("mcp.tools.call", "supported", "#routes-tools-through-controlled-bindings"),
  operation("mcp.resources.list", "supported", "#lists-resources-deterministically"),
  operation(
    "mcp.resources.templates.list-empty",
    "supported",
    "#lists-no-unregistered-resource-templates",
  ),
  operation("mcp.resources.read", "supported", "#reads-authorised-static-resources"),
  operation("mcp.request.transport-cancellation", "supported", "#propagates-request-cancellation"),
  operation("mcp.subscriptions.listen", "supported", "#supports-native-change-subscriptions"),
  operation(
    "mcp.legacy.stateless-request",
    "supported",
    "#supports-explicit-legacy-stateless-mode",
  ),
  operation("mcp.modern.initialize", "unsupported", "#rejects-modern-initialize"),
  operation("mcp.protocol.ping", "unsupported", "#rejects-unregistered-ping"),
  operation("mcp.prompts.list", "unsupported", "#rejects-unregistered-prompts-list"),
  operation("mcp.prompts.get", "unsupported", "#rejects-unregistered-prompts-get"),
  operation("mcp.resources.subscribe", "unsupported", "#rejects-resource-subscriptions"),
  operation("mcp.completion.complete", "unsupported", "#rejects-completion"),
  operation("mcp.sampling.create-message", "unsupported", "#rejects-sampling"),
  operation("mcp.elicitation.create", "unsupported", "#rejects-elicitation"),
  operation("mcp.roots.list", "unsupported", "#rejects-roots"),
  operation("mcp.tasks.list", "unsupported", "#rejects-protocol-tasks-list"),
  operation("mcp.logging.set-level", "unsupported", "#rejects-logging-control"),
]);
