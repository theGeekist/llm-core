import { type JsonValue } from "#contracts";
import { executeControlledTool, type ToolExecutionControl } from "../../../tools/runtime";
import {
  createMcpHandler,
  fromJsonSchema,
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  type AuthInfo,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { controlledToolBoundaryFailure, projectControlledToolOutcome } from "./controlled-result";
import type {
  McpAuthorisedOperation,
  McpPrincipal,
  McpResourceBinding,
  McpStatelessHost,
  McpStatelessHostDefinition,
  McpToolBinding,
} from "./types";
import {
  registerMcpPrincipal,
  registerMcpControlledExecution,
  registerMcpResourceResult,
  registerMcpStatelessHostDefinition,
  registerMcpToolResult,
  type RegisteredMcpStatelessHost,
} from "./validation";

const PRINCIPAL_KEY = "llm-core.mcp/principal";

const authInfo = (principal: McpPrincipal): AuthInfo => ({
  token: "[redacted]",
  clientId: principal.id,
  scopes: [...principal.scopes],
  extra: { [PRINCIPAL_KEY]: principal },
});

const principalFromAuth = (auth: AuthInfo | undefined): McpPrincipal => {
  const principal = auth?.extra?.[PRINCIPAL_KEY];
  if (!principal) {
    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      "Authenticated principal unavailable.",
    );
  }
  return principal as McpPrincipal;
};

const principalFromServer = (context: ServerContext): McpPrincipal =>
  principalFromAuth(context.http?.authInfo);

const methodOperation = (method: string | null): McpAuthorisedOperation | null => {
  switch (method) {
    case "server/discover":
      return "server.discover";
    case "tools/list":
      return "tools.list";
    case "tools/call":
      return "tools.call";
    case "resources/list":
      return "resources.list";
    case "resources/templates/list":
      return "resources.templates.list";
    case "resources/read":
      return "resources.read";
    case "subscriptions/listen":
      return "subscriptions.listen";
    case "initialize":
      return "legacy.stateless";
    default:
      return null;
  }
};

const inspectedRequest = async (
  request: Request,
): Promise<{ readonly method: string; readonly target?: string } | null> => {
  if (request.method !== "POST") return null;
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.method !== "string") return null;
  const params =
    typeof record.params === "object" && record.params !== null && !Array.isArray(record.params)
      ? (record.params as Record<string, unknown>)
      : undefined;
  const target =
    record.method === "tools/call" && typeof params?.name === "string"
      ? params.name
      : record.method === "resources/read" && typeof params?.uri === "string"
        ? params.uri
        : undefined;
  return { method: record.method, ...(target === undefined ? {} : { target }) };
};

const authoriseRequest = async (
  host: RegisteredMcpStatelessHost,
  principal: McpPrincipal,
  request: Request,
): Promise<Response | null> => {
  const inspected = await inspectedRequest(request);
  if (!inspected) return null;
  const method = inspected.method;
  const operation = methodOperation(method);
  if (!operation) return null;
  const allowed = await host.authorise({
    principal,
    operation,
    ...(inspected.target === undefined ? {} : { target: inspected.target }),
  });
  if (allowed !== true) {
    return new Response(null, { status: 404 });
  }
  return null;
};

const invocation = (context: ServerContext, principal: McpPrincipal) => ({
  principal,
  requestId: context.mcpReq.id,
  signal: context.mcpReq.signal,
});

const transportExecutionControl = (signal: AbortSignal): ToolExecutionControl => ({
  isCancellationRequested: () => signal.aborted,
  onCancellationRequested: (handler) => {
    if (signal.aborted) {
      handler();
      return () => undefined;
    }
    signal.addEventListener("abort", handler, { once: true });
    return () => signal.removeEventListener("abort", handler);
  },
});

const registerTool = (server: McpServer, binding: McpToolBinding): void => {
  const definition = binding.definition;
  server.registerTool(
    definition.name,
    {
      ...(definition.title === undefined ? {} : { title: definition.title }),
      ...(definition.description === undefined ? {} : { description: definition.description }),
      inputSchema: fromJsonSchema(
        binding.tool.definition.inputSchema.document as Record<string, unknown>,
      ),
      ...(definition.outputSchema === undefined
        ? {}
        : { outputSchema: fromJsonSchema(definition.outputSchema as Record<string, unknown>) }),
      ...(definition.annotations === undefined ? {} : { annotations: definition.annotations }),
    },
    async (argumentsValue, requestContext) => {
      try {
        const context = invocation(requestContext, principalFromServer(requestContext));
        const argumentsSnapshot = argumentsValue as JsonValue;
        const prepared = registerMcpControlledExecution(
          await binding.prepareControlledExecution({
            ...context,
            arguments: argumentsSnapshot,
          }),
          binding,
          argumentsSnapshot,
        );
        const outcome = await executeControlledTool({
          ...prepared,
          tool: binding.tool,
          executionControl: transportExecutionControl(context.signal),
        });
        return registerMcpToolResult(projectControlledToolOutcome(outcome));
      } catch {
        return controlledToolBoundaryFailure();
      }
    },
  );
};

const registerResource = (server: McpServer, binding: McpResourceBinding): void => {
  const definition = binding.definition;
  server.registerResource(
    definition.name,
    definition.uri,
    {
      ...(definition.title === undefined ? {} : { title: definition.title }),
      ...(definition.description === undefined ? {} : { description: definition.description }),
      ...(definition.mimeType === undefined ? {} : { mimeType: definition.mimeType }),
    },
    async (uri, requestContext) => {
      try {
        return await registerMcpResourceResult(
          await binding.read({
            ...invocation(requestContext, principalFromServer(requestContext)),
            uri: uri.href,
          }),
        );
      } catch {
        throw new ProtocolError(ProtocolErrorCode.InternalError, "MCP resource read failed.");
      }
    },
  );
};

const createServer = async (host: RegisteredMcpStatelessHost): Promise<McpServer> => {
  const server = new McpServer({ name: host.name, version: host.version });
  host.tools.forEach((binding) => registerTool(server, binding));
  host.resources.forEach((binding) => registerResource(server, binding));
  return server;
};

const authenticationFailure = (): Response =>
  new Response(null, {
    status: 401,
    headers: { "www-authenticate": "Bearer" },
  });

const internalFailure = (): Response => new Response(null, { status: 500 });

export const createMcpStatelessHost = (
  definition: McpStatelessHostDefinition,
): McpStatelessHost => {
  const host = registerMcpStatelessHostDefinition(definition);
  const handler = createMcpHandler(() => createServer(host), {
    legacy: host.legacy,
  });
  return Object.freeze({
    fetch: async (request: Request): Promise<Response> => {
      try {
        const authenticated = await host.authenticate({
          request,
          authorization: request.headers.get("authorization"),
        });
        if (authenticated === null) return authenticationFailure();
        const principal = registerMcpPrincipal(authenticated);
        const denied = await authoriseRequest(host, principal, request);
        if (denied) return denied;
        return await handler.fetch(request, { authInfo: authInfo(principal) });
      } catch {
        return internalFailure();
      }
    },
    close: handler.close,
    notify: handler.notify,
  });
};
