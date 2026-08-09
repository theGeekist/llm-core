import { describe, expect, test } from "bun:test";
import {
  createMcpStatelessHost,
  MCP_CLIENT_SDK_VERSION,
  MCP_OPERATION_MATRIX,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_SDK_VERSION,
} from "../../../../src/adapters/protocols/mcp";
import { contractVersion } from "#contracts";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { CALL_ID, RUN_ID } from "../../../application/tool-execution/execute-fixtures";
import {
  authorisationRecorder,
  controlledBinding,
  hostDefinition,
  legacyInitialiseRequest,
  modernRequest,
  responseBody,
} from "./fixtures";

const resultOf = (body: Record<string, unknown>): Record<string, unknown> =>
  body.result as Record<string, unknown>;

const pendingConcurrencyLease = (started: PromiseWithResolvers<void>) => () => {
  started.resolve();
  return new Promise<never>(() => undefined);
};

describe("MCP 2026-07-28 stateless protocol", () => {
  test("runs-the-pinned-official-client-against-the-pinned-official-server", async () => {
    const host = createMcpStatelessHost(hostDefinition());
    const client = new Client(
      { name: "qualification-client", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: MCP_PROTOCOL_VERSION } } },
    );
    const transport = new StreamableHTTPClientTransport(new URL("https://example.test/mcp"), {
      authProvider: { token: () => Promise.resolve("test-token") },
      fetch: (_url, init) => host.fetch(new Request("https://example.test/mcp", init)),
    });

    await client.connect(transport);
    expect((await client.listTools()).tools.map(({ name }) => name)).toEqual(["alpha", "zebra"]);
    expect(await client.callTool({ name: "alpha", arguments: { amount: 100 } })).toMatchObject({
      content: [{ type: "text", text: "100" }],
    });

    await client.close();
    await host.close();
  });

  test("supports-discovery-per-request", async () => {
    let authentications = 0;
    const host = createMcpStatelessHost(
      hostDefinition({
        authenticate: () => {
          authentications += 1;
          return { id: "discovery", scopes: ["mcp"] };
        },
      }),
    );
    const first = await host.fetch(modernRequest("server/discover"));
    const second = await host.fetch(modernRequest("server/discover", {}, { id: 2 }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(authentications).toBe(2);
    expect(resultOf(await responseBody(first))).toMatchObject({
      supportedVersions: ["2026-07-28"],
      _meta: {
        "io.modelcontextprotocol/serverInfo": {
          name: "qualification-server",
          version: "1.0.0",
        },
      },
    });
    await host.close();
  });

  test("lists-tools-deterministically", async () => {
    const host = createMcpStatelessHost(hostDefinition());
    const first = resultOf(await responseBody(await host.fetch(modernRequest("tools/list"))));
    const second = resultOf(
      await responseBody(await host.fetch(modernRequest("tools/list", {}, { id: 2 }))),
    );
    expect((first.tools as Array<{ name: string }>).map(({ name }) => name)).toEqual([
      "alpha",
      "zebra",
    ]);
    expect(second.tools).toEqual(first.tools);
    await host.close();
  });

  test("routes-tools-through-controlled-bindings", async () => {
    const recorder = authorisationRecorder();
    let observed: unknown;
    const source = hostDefinition();
    const lane = controlledBinding("alpha");
    const prepare = lane.binding.prepareControlledExecution;
    const host = createMcpStatelessHost({
      ...source,
      authorise: recorder.hook,
      tools: source.tools.map((binding) =>
        binding.definition.name === "alpha"
          ? {
              ...lane.binding,
              prepareControlledExecution: (input) => {
                observed = input;
                return prepare(input);
              },
            }
          : binding,
      ),
    });
    const body = await responseBody(
      await host.fetch(modernRequest("tools/call", { name: "alpha", arguments: { amount: 100 } })),
    );
    expect(resultOf(body).content).toEqual([{ type: "text", text: "100" }]);
    expect(observed).toMatchObject({
      principal: { id: "principal-1", scopes: ["mcp:read", "mcp:tools"] },
      requestId: 1,
      arguments: { amount: 100 },
    });
    expect((observed as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
    const receipt = [...lane.journal.byId.values()][0]!;
    expect(receipt).toMatchObject({ runId: RUN_ID, toolCallId: CALL_ID, state: "succeeded" });
    expect(recorder.requests).toContainEqual({
      principal: { id: "principal-1", scopes: ["mcp:read", "mcp:tools"] },
      operation: "tools.call",
      target: "alpha",
    });
    await host.close();
  });

  test("rejects arguments against the registered kernel schema before execution", async () => {
    const source = hostDefinition();
    const lane = controlledBinding("alpha");
    const host = createMcpStatelessHost({
      ...source,
      tools: source.tools.map((binding) =>
        binding.definition.name === "alpha" ? lane.binding : binding,
      ),
    });
    const body = await responseBody(
      await host.fetch(
        modernRequest("tools/call", { name: "alpha", arguments: { amount: "invalid" } }),
      ),
    );
    expect(resultOf(body)).toMatchObject({ isError: true });
    expect(lane.journal.byId.size).toBe(0);
    await host.close();
  });

  test("projects policy denial without invoking or leaking controlled facts", async () => {
    const source = hostDefinition();
    const lane = controlledBinding("alpha", (input) => {
      input.policy = {
        evaluate: ({ evaluation }) => ({
          evaluation,
          policyId: "mcp.test-policy",
          policyVersion: contractVersion("1.0.0"),
          decidedAt: "2026-07-29T00:00:00.000Z",
          decision: "deny",
          reasonCodes: ["private-policy-reason"],
        }),
      };
    });
    const host = createMcpStatelessHost({
      ...source,
      tools: source.tools.map((binding) =>
        binding.definition.name === "alpha" ? lane.binding : binding,
      ),
    });
    const body = await responseBody(
      await host.fetch(modernRequest("tools/call", { name: "alpha", arguments: { amount: 100 } })),
    );
    expect(resultOf(body)).toMatchObject({
      content: [{ type: "text", text: "llm-core.controlled-tool.denied" }],
      isError: true,
    });
    expect(JSON.stringify(body)).not.toContain("private-policy-reason");
    expect([...lane.journal.byId.values()][0]?.state).toBe("denied");
    await host.close();
  });

  test("preserves approval gating as an explicit controlled outcome", async () => {
    const source = hostDefinition();
    const lane = controlledBinding("alpha", (input) => {
      input.policy = {
        evaluate: ({ evaluation }) => ({
          evaluation,
          policyId: "mcp.test-policy",
          policyVersion: contractVersion("1.0.0"),
          decidedAt: "2026-07-29T00:00:00.000Z",
          decision: "require-approval",
        }),
      };
      input.approval = {
        expiresAt: "2026-07-29T00:01:00.000Z",
        authenticator: { verify: () => ({ status: "rejected", reasonCode: "not-used" }) },
        request: () => Promise.resolve(null),
      };
    });
    const host = createMcpStatelessHost({
      ...source,
      tools: source.tools.map((binding) =>
        binding.definition.name === "alpha" ? lane.binding : binding,
      ),
    });
    const body = await responseBody(
      await host.fetch(modernRequest("tools/call", { name: "alpha", arguments: { amount: 100 } })),
    );
    expect(resultOf(body)).toMatchObject({
      content: [{ type: "text", text: "llm-core.controlled-tool.awaiting-approval" }],
      isError: true,
    });
    expect([...lane.journal.byId.values()][0]?.state).toBe("awaiting_approval");
    await host.close();
  });

  test("rejects a prepared ToolCall that is not correlated to the MCP arguments", async () => {
    const source = hostDefinition();
    const lane = controlledBinding("alpha");
    const prepare = lane.binding.prepareControlledExecution;
    const host = createMcpStatelessHost({
      ...source,
      tools: source.tools.map((binding) =>
        binding.definition.name === "alpha"
          ? {
              ...lane.binding,
              prepareControlledExecution: async (context) => {
                const prepared = await prepare(context);
                return { ...prepared, call: { ...prepared.call, arguments: { amount: 101 } } };
              },
            }
          : binding,
      ),
    });
    const body = await responseBody(
      await host.fetch(modernRequest("tools/call", { name: "alpha", arguments: { amount: 100 } })),
    );
    expect(resultOf(body)).toMatchObject({
      content: [{ type: "text", text: "llm-core.controlled-tool.indeterminate" }],
      isError: true,
    });
    expect(lane.journal.byId.size).toBe(0);
    await host.close();
  });

  test("lists-resources-deterministically", async () => {
    const host = createMcpStatelessHost(hostDefinition());
    const listed = resultOf(await responseBody(await host.fetch(modernRequest("resources/list"))));
    expect((listed.resources as Array<{ uri: string }>).map(({ uri }) => uri)).toEqual([
      "test://resources/alpha",
      "test://resources/zulu",
    ]);
    await host.close();
  });

  test("reads-authorised-static-resources", async () => {
    const host = createMcpStatelessHost(hostDefinition());
    const read = resultOf(
      await responseBody(
        await host.fetch(modernRequest("resources/read", { uri: "test://resources/alpha" })),
      ),
    );
    expect(read.contents).toEqual([{ uri: "test://resources/alpha", text: "alpha" }]);
    await host.close();
  });

  test("lists-no-unregistered-resource-templates", async () => {
    const recorder = authorisationRecorder();
    const host = createMcpStatelessHost(hostDefinition({ authorise: recorder.hook }));
    const result = resultOf(
      await responseBody(await host.fetch(modernRequest("resources/templates/list"))),
    );
    expect(result.resourceTemplates).toEqual([]);
    expect(recorder.requests).toContainEqual({
      principal: { id: "principal-1", scopes: ["mcp:read", "mcp:tools"] },
      operation: "resources.templates.list",
    });
    await host.close();
  });

  test("propagates-request-cancellation", async () => {
    const started = Promise.withResolvers<void>();
    const source = hostDefinition();
    const lane = controlledBinding("alpha", (input) => {
      input.concurrency = {
        acquire: pendingConcurrencyLease(started),
      };
    });
    const host = createMcpStatelessHost({
      ...source,
      tools: source.tools.map((binding) =>
        binding.definition.name === "alpha" ? lane.binding : binding,
      ),
    });
    const cancellation = new AbortController();
    const response = host.fetch(
      modernRequest(
        "tools/call",
        { name: "alpha", arguments: { amount: 100 } },
        { signal: cancellation.signal },
      ),
    );
    await started.promise;
    cancellation.abort();
    await response.catch(() => undefined);
    expect([...lane.journal.byId.values()][0]?.state).toBe("cancelled_before_start");
    await host.close();
  });

  test("supports-native-change-subscriptions", async () => {
    const recorder = authorisationRecorder();
    const host = createMcpStatelessHost(hostDefinition({ authorise: recorder.hook }));
    const cancellation = new AbortController();
    const response = await host.fetch(
      modernRequest(
        "subscriptions/listen",
        { notifications: { toolsListChanged: true } },
        { signal: cancellation.signal },
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(recorder.requests).toContainEqual({
      principal: { id: "principal-1", scopes: ["mcp:read", "mcp:tools"] },
      operation: "subscriptions.listen",
    });
    host.notify.toolsChanged();
    cancellation.abort();
    await response.body?.cancel().catch(() => undefined);
    await host.close();
  });

  test("supports-explicit-legacy-stateless-mode", async () => {
    let authentications = 0;
    const host = createMcpStatelessHost(
      hostDefinition({
        legacy: "stateless",
        authenticate: () => {
          authentications += 1;
          return { id: "legacy", scopes: ["mcp"] };
        },
      }),
    );
    const first = await host.fetch(legacyInitialiseRequest());
    const second = await host.fetch(legacyInitialiseRequest());
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers.has("mcp-session-id")).toBe(false);
    expect(second.headers.has("mcp-session-id")).toBe(false);
    expect(authentications).toBe(2);
    await host.close();
  });

  test("rejects-modern-initialize", async () => {
    const host = createMcpStatelessHost(hostDefinition());
    const response = await host.fetch(modernRequest("initialize"));
    expect(response.status).not.toBe(200);
    await host.close();
  });
});

describe("MCP exact operation declarations", () => {
  test("pins the official protocol and both stable SDK versions", () => {
    expect(MCP_PROTOCOL_VERSION).toBe("2026-07-28");
    expect(MCP_SERVER_SDK_VERSION).toBe("2.0.0");
    expect(MCP_CLIENT_SDK_VERSION).toBe("2.0.0");
    expect(MCP_OPERATION_MATRIX.every((entry) => entry.protocolVersion === "2026-07-28")).toBe(
      true,
    );
    expect(MCP_OPERATION_MATRIX.every((entry) => entry.serverSdkVersion === "2.0.0")).toBe(true);
    expect(MCP_OPERATION_MATRIX.every((entry) => entry.clientSdkVersion === "2.0.0")).toBe(true);
    expect(MCP_OPERATION_MATRIX.some((entry) => entry.disposition === "not-applicable")).toBe(
      false,
    );
    expect(Object.isFrozen(MCP_OPERATION_MATRIX)).toBe(true);
    expect(MCP_OPERATION_MATRIX.every(Object.isFrozen)).toBe(true);
  });

  const unsupported = [
    { fixture: "rejects-unregistered-ping", method: "ping", params: {} },
    { fixture: "rejects-unregistered-prompts-list", method: "prompts/list", params: {} },
    {
      fixture: "rejects-unregistered-prompts-get",
      method: "prompts/get",
      params: { name: "missing" },
    },
    {
      fixture: "rejects-resource-subscriptions",
      method: "resources/subscribe",
      params: { uri: "test://resources/alpha" },
    },
    {
      fixture: "rejects-completion",
      method: "completion/complete",
      params: { ref: { type: "ref/prompt", name: "missing" }, argument: {} },
    },
    { fixture: "rejects-sampling", method: "sampling/createMessage", params: {} },
    { fixture: "rejects-elicitation", method: "elicitation/create", params: {} },
    { fixture: "rejects-roots", method: "roots/list", params: {} },
    { fixture: "rejects-protocol-tasks-list", method: "tasks/list", params: {} },
    {
      fixture: "rejects-logging-control",
      method: "logging/setLevel",
      params: { level: "info" },
    },
  ] as const;

  for (const fixture of unsupported) {
    test(fixture.fixture, async () => {
      const host = createMcpStatelessHost(hostDefinition());
      const { method, params } = fixture;
      const response = await host.fetch(modernRequest(method, params));
      const body = await responseBody(response);
      expect(body.error, method).toBeDefined();
      await host.close();
    });
  }
});
