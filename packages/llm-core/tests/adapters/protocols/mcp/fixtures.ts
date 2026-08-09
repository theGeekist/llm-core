import type {
  McpAuthorisationRequest,
  McpPrincipal,
  McpStatelessHostDefinition,
  McpToolBinding,
} from "../../../../src/adapters/protocols/mcp";
import type { ExecuteControlledToolInput } from "../../../../src/tools/runtime";
import { baseInput, MemoryJournal } from "../../../application/tool-execution/execute-fixtures";

export const PRINCIPAL: McpPrincipal = Object.freeze({
  id: "principal-1",
  scopes: Object.freeze(["mcp:read", "mcp:tools"]),
});

export const controlledBinding = (
  name: string,
  configure?: (input: ExecuteControlledToolInput) => void,
  execute: Parameters<typeof baseInput>[1] = ({ call }) => ({
    toolCallId: call.toolCallId,
    status: "succeeded",
    content: [{ kind: "text", text: String((call.arguments as { amount: number }).amount) }],
  }),
): { readonly binding: McpToolBinding; readonly journal: MemoryJournal } => {
  const journal = new MemoryJournal();
  const input = baseInput(journal, execute);
  configure?.(input);
  const binding: McpToolBinding = {
    definition: {
      name,
      description: `${name} controlled tool.`,
    },
    tool: input.tool,
    prepareControlledExecution: ({ arguments: argumentsValue }) => {
      const { tool: _tool, ...prepared } = input;
      void _tool;
      return {
        ...prepared,
        call: { ...input.call, arguments: argumentsValue },
      };
    },
  };
  return { binding, journal };
};

export const hostDefinition = (
  overrides: Partial<McpStatelessHostDefinition> = {},
): McpStatelessHostDefinition => ({
  name: "qualification-server",
  version: "1.0.0",
  legacy: "reject",
  tools: [controlledBinding("zebra").binding, controlledBinding("alpha").binding],
  resources: [
    {
      definition: {
        name: "Zulu resource",
        uri: "test://resources/zulu",
        mimeType: "text/plain",
      },
      read: ({ uri }) => ({ contents: [{ uri, text: "zulu" }] }),
    },
    {
      definition: {
        name: "Alpha resource",
        uri: "test://resources/alpha",
        mimeType: "text/plain",
      },
      read: ({ uri }) => ({ contents: [{ uri, text: "alpha" }] }),
    },
  ],
  authenticate: () => PRINCIPAL,
  authorise: () => true,
  ...overrides,
});

const envelope = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "qualification-client", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

export const modernRequest = (
  method: string,
  params: Record<string, unknown> = {},
  options: {
    readonly id?: number;
    readonly methodHeader?: string | null;
    readonly nameHeader?: string | null;
    readonly signal?: AbortSignal;
  } = {},
): Request => {
  const headers = new Headers({
    authorization: "Bearer test-token",
    "content-type": "application/json",
    "mcp-protocol-version": "2026-07-28",
  });
  if (options.methodHeader !== null) headers.set("mcp-method", options.methodHeader ?? method);
  const target =
    method === "tools/call" ? params.name : method === "resources/read" ? params.uri : null;
  if (options.nameHeader !== null && typeof target === "string") {
    headers.set("mcp-name", options.nameHeader ?? target);
  }
  return new Request("https://example.test/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: options.id ?? 1,
      method,
      params: { ...params, _meta: envelope },
    }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
};

export const legacyInitialiseRequest = (): Request =>
  new Request("https://example.test/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "legacy-client", version: "1.0.0" },
      },
    }),
  });

export const responseBody = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

export const authorisationRecorder = (): {
  readonly requests: McpAuthorisationRequest[];
  readonly hook: McpStatelessHostDefinition["authorise"];
} => {
  const requests: McpAuthorisationRequest[] = [];
  return {
    requests,
    hook: (request) => {
      requests.push(request);
      return true;
    },
  };
};
