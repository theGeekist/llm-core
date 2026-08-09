import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMcpStatelessHost,
  MCP_CLIENT_SDK_VERSION,
  MCP_OPERATION_MATRIX,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_SDK_VERSION,
} from "@geekist/llm-core/mcp";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { packedControlledBinding } from "./controlled-tool-fixture";

const packageIdentity = (path: string): { name: string; version: string } =>
  JSON.parse(readFileSync(join(import.meta.dir, "node_modules", path, "package.json"), "utf8")) as {
    name: string;
    version: string;
  };
const clientPackage = packageIdentity("@modelcontextprotocol/client");
const serverPackage = packageIdentity("@modelcontextprotocol/server");
if (clientPackage.name !== "@modelcontextprotocol/client" || clientPackage.version !== "2.0.0") {
  throw new Error(
    `unexpected MCP client SDK resolution ${clientPackage.name}@${clientPackage.version}`,
  );
}
if (serverPackage.name !== "@modelcontextprotocol/server" || serverPackage.version !== "2.0.0") {
  throw new Error(
    `unexpected MCP server SDK resolution ${serverPackage.name}@${serverPackage.version}`,
  );
}
if (
  MCP_PROTOCOL_VERSION !== "2026-07-28" ||
  MCP_CLIENT_SDK_VERSION !== clientPackage.version ||
  MCP_SERVER_SDK_VERSION !== serverPackage.version
) {
  throw new Error("packed MCP authority constants do not match the fixture pins");
}

const controlled = packedControlledBinding();
const host = createMcpStatelessHost({
  name: "external-consumer",
  version: "1.0.0",
  legacy: "reject",
  tools: [controlled.binding],
  resources: [
    {
      definition: {
        name: "External resource",
        uri: "app://external/resource",
        mimeType: "application/json",
      },
      read: ({ uri }) => ({ contents: [{ uri, text: '{"qualified":true}' }] }),
    },
  ],
  authenticate: () => ({ id: "packed-consumer", scopes: ["mcp"] }),
  authorise: () => true,
});

const serverUrl = new URL("https://consumer.example.test/mcp");
const transport = new StreamableHTTPClientTransport(serverUrl, {
  authProvider: { token: async () => "fixture" },
  fetch: (_input, init) => host.fetch(new Request(serverUrl, init)),
});
const client = new Client(
  { name: "packed-consumer", version: "1.0.0" },
  { versionNegotiation: { mode: { pin: MCP_PROTOCOL_VERSION } } },
);
await client.connect(transport);

const tools = await client.listTools();
const called = await client.callTool({ name: "echo", arguments: { value: "hello" } });
const resources = await client.listResources();
const read = await client.readResource({ uri: "app://external/resource" });
if (tools.tools.map(({ name }) => name).join(",") !== "echo") {
  throw new Error("packed MCP surface did not expose the application tool catalogue");
}
if (!JSON.stringify(called.content).includes("packed-consumer:hello")) {
  throw new Error("packed MCP surface bypassed the controlled application binding");
}
if (
  !resources.resources.some(({ uri }) => uri === "app://external/resource") ||
  !JSON.stringify(read.contents).includes("qualified")
) {
  throw new Error("packed MCP surface did not preserve the application resource boundary");
}
if (![...controlled.journal.receipts.values()].some(({ state }) => state === "succeeded")) {
  throw new Error("packed MCP controlled call did not persist a succeeded receipt");
}
if (
  !MCP_OPERATION_MATRIX.some(
    ({ operation, disposition }) => operation === "mcp.tools.call" && disposition === "supported",
  )
) {
  throw new Error("packed MCP operation matrix omitted controlled tool calls");
}
await client.close();
await host.close();

console.log("Packed stateless MCP consumer qualification passed.");
