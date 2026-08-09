import { describe, expect, test } from "bun:test";
import { digest } from "#contracts";
import {
  createMcpStatelessHost,
  McpBoundaryError,
  registerMcpPrincipal,
  registerMcpResourceResult,
  registerMcpToolResult,
} from "../../../../src/adapters/protocols/mcp";
import { createExecutableTool, registerToolSchema } from "../../../../src/tools/runtime";
import { SPEC } from "../../../application/tool-execution/execute-fixtures";
import {
  authorisationRecorder,
  controlledBinding,
  hostDefinition,
  modernRequest,
  PRINCIPAL,
  responseBody,
} from "./fixtures";

const resultOf = (body: Record<string, unknown>): Record<string, unknown> =>
  body.result as Record<string, unknown>;

describe("MCP closed registration boundaries", () => {
  test("rejects accessor-backed host fields without reading them", () => {
    let reads = 0;
    const hostile = {
      get name() {
        reads += 1;
        return "hostile";
      },
      version: "1.0.0",
      tools: [],
      resources: [],
      authenticate: () => PRINCIPAL,
      authorise: () => true,
    };

    expect(() => createMcpStatelessHost(hostile)).toThrow(McpBoundaryError);
    expect(reads).toBe(0);
  });

  test("rejects undeclared configuration and binding fields", () => {
    expect(() =>
      createMcpStatelessHost({ ...hostDefinition(), providerState: "secret" } as never),
    ).toThrow("only declared enumerable data fields");
    expect(() =>
      createMcpStatelessHost({
        ...hostDefinition(),
        tools: [
          {
            ...hostDefinition().tools[0]!,
            nativeHandler: () => undefined,
          } as never,
        ],
      }),
    ).toThrow("only declared enumerable data fields");
  });

  test("rejects duplicate tool and resource identities", () => {
    const source = hostDefinition();
    expect(() =>
      createMcpStatelessHost({ ...source, tools: [source.tools[0]!, source.tools[0]!] }),
    ).toThrow("MCP tool identities must be unique");
    expect(() =>
      createMcpStatelessHost({
        ...source,
        resources: [source.resources[0]!, source.resources[0]!],
      }),
    ).toThrow("MCP resource identities must be unique");
  });

  test("rejects every malformed nested input and output schema during registration", async () => {
    const malformedSchemas = [
      { type: "object", properties: "not-an-object" },
      { type: "object", required: "not-an-array" },
      { type: "object", additionalProperties: "not-a-boolean-or-schema" },
      { type: "object", properties: { value: { type: "not-a-json-type" } } },
    ] as const;
    for (const malformed of malformedSchemas) {
      const registered = await registerToolSchema(malformed, {
        digest: () => digest("a".repeat(64)),
      });
      const lane = controlledBinding("alpha");
      const tool = createExecutableTool({
        definition: { ...SPEC, inputSchema: registered },
        argumentValidator: { validate: () => ({ valid: true }) },
        execute: lane.binding.tool.execute,
      });
      expect(() =>
        createMcpStatelessHost({
          ...hostDefinition(),
          tools: [{ ...lane.binding, tool }],
        }),
      ).toThrow("complete valid JSON Schema");
      expect(() =>
        createMcpStatelessHost({
          ...hostDefinition(),
          tools: [
            {
              ...lane.binding,
              definition: { ...lane.binding.definition, outputSchema: malformed },
            },
          ],
        }),
      ).toThrow("complete valid JSON Schema");
    }
  });

  test("rejects malformed or undeclared tool annotations", () => {
    const lane = controlledBinding("alpha");
    expect(() =>
      createMcpStatelessHost({
        ...hostDefinition(),
        tools: [
          {
            ...lane.binding,
            definition: {
              ...lane.binding.definition,
              annotations: { readOnlyHint: "yes" } as never,
            },
          },
        ],
      }),
    ).toThrow("exact SDK contract");
    expect(() =>
      createMcpStatelessHost({
        ...hostDefinition(),
        tools: [
          {
            ...lane.binding,
            definition: {
              ...lane.binding.definition,
              annotations: { readOnlyHint: true, providerState: "secret" } as never,
            },
          },
        ],
      }),
    ).toThrow("undeclared fields");
  });

  test("rejects accessor-backed principals and native results without reading them", async () => {
    let principalReads = 0;
    let resultReads = 0;
    const hostilePrincipal = {
      get id() {
        principalReads += 1;
        return "hostile";
      },
      scopes: [],
    };
    const hostileResult = {
      get content() {
        resultReads += 1;
        return [];
      },
    };

    expect(() => registerMcpPrincipal(hostilePrincipal)).toThrow(McpBoundaryError);
    await expect(registerMcpToolResult(hostileResult)).rejects.toThrow(McpBoundaryError);
    await expect(registerMcpResourceResult(hostileResult)).rejects.toThrow(McpBoundaryError);
    expect(principalReads).toBe(0);
    expect(resultReads).toBe(0);
  });
});

describe("MCP authentication and authorisation boundaries", () => {
  test("authenticates every request and rejects an unauthenticated request before dispatch", async () => {
    let authenticationCalls = 0;
    let toolCalls = 0;
    const source = hostDefinition();
    const host = createMcpStatelessHost({
      ...source,
      tools: source.tools.map((binding) => ({
        ...binding,
        prepareControlledExecution: () => {
          toolCalls += 1;
          throw new Error("must not execute");
        },
      })),
      authenticate: () => {
        authenticationCalls += 1;
        return null;
      },
    });

    const response = await host.fetch(
      modernRequest("tools/call", { name: "alpha", arguments: { amount: 100 } }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(authenticationCalls).toBe(1);
    expect(toolCalls).toBe(0);
    await host.close();
  });

  test("binds authorisation to the body operation when headers are absent or contradictory", async () => {
    const recorder = authorisationRecorder();
    const host = createMcpStatelessHost(hostDefinition({ authorise: recorder.hook }));

    const absent = await host.fetch(
      modernRequest(
        "tools/call",
        { name: "alpha", arguments: { amount: 100 } },
        { methodHeader: null, nameHeader: null },
      ),
    );
    const mismatched = await host.fetch(
      modernRequest(
        "tools/call",
        { name: "alpha", arguments: { amount: 100 } },
        { methodHeader: "resources/read", nameHeader: "test://resources/zulu" },
      ),
    );

    expect(recorder.requests).toEqual([
      { principal: PRINCIPAL, operation: "tools.call", target: "alpha" },
      { principal: PRINCIPAL, operation: "tools.call", target: "alpha" },
    ]);
    expect(absent.status).not.toBe(200);
    expect(mismatched.status).not.toBe(200);
    await host.close();
  });

  test("fails closed before SDK dispatch when authorisation denies", async () => {
    let calls = 0;
    const source = hostDefinition();
    const host = createMcpStatelessHost({
      ...source,
      tools: source.tools.map((binding) => ({
        ...binding,
        prepareControlledExecution: () => {
          calls += 1;
          throw new Error("must not execute");
        },
      })),
      authorise: () => false,
    });

    const response = await host.fetch(
      modernRequest("tools/call", { name: "alpha", arguments: { amount: 100 } }),
    );
    expect(response.status).toBe(404);
    expect(calls).toBe(0);
    await host.close();
  });

  test("does not disclose unknown resource existence through authorisation denial", async () => {
    const host = createMcpStatelessHost(hostDefinition({ authorise: () => false }));
    const known = await host.fetch(
      modernRequest("resources/read", { uri: "test://resources/alpha" }),
    );
    const unknown = await host.fetch(
      modernRequest("resources/read", { uri: "test://resources/unknown" }),
    );
    expect([known.status, await known.text()]).toEqual([unknown.status, await unknown.text()]);
    await host.close();
  });

  test("sanitises authentication and authorisation hook failures into Responses", async () => {
    const authenticationHost = createMcpStatelessHost(
      hostDefinition({ authenticate: () => Promise.reject(new Error("authentication-secret")) }),
    );
    const authentication = await authenticationHost.fetch(modernRequest("tools/list"));
    expect([authentication.status, await authentication.text()]).toEqual([500, ""]);
    await authenticationHost.close();

    const authorisationHost = createMcpStatelessHost(
      hostDefinition({ authorise: () => Promise.reject(new Error("authorisation-secret")) }),
    );
    const authorisation = await authorisationHost.fetch(modernRequest("tools/list"));
    expect([authorisation.status, await authorisation.text()]).toEqual([500, ""]);
    await authorisationHost.close();
  });
});

describe("MCP native result errors", () => {
  test("turns malformed controlled-binding output into an MCP internal error", async () => {
    const source = hostDefinition();
    const host = createMcpStatelessHost({
      ...source,
      tools: source.tools.map((binding) =>
        binding.definition.name === "alpha"
          ? {
              ...binding,
              prepareControlledExecution: () => ({ providerState: "secret" }) as never,
            }
          : binding,
      ),
    });
    const response = await host.fetch(
      modernRequest("tools/call", { name: "alpha", arguments: { amount: 100 } }),
    );
    const body = await responseBody(response);
    expect(response.status).toBe(200);
    expect(body.result).toMatchObject({ isError: true });
    expect(JSON.stringify(body)).not.toContain("secret");
    await host.close();
  });

  test("sanitises controlled preparation and kernel execution failures", async () => {
    const source = hostDefinition();
    const preparationLane = controlledBinding("alpha");
    const preparationHost = createMcpStatelessHost({
      ...source,
      tools: source.tools.map((binding) =>
        binding.definition.name === "alpha"
          ? {
              ...preparationLane.binding,
              prepareControlledExecution: () => {
                throw new Error("preparation-secret");
              },
            }
          : binding,
      ),
    });
    const preparationBody = await responseBody(
      await preparationHost.fetch(
        modernRequest("tools/call", { name: "alpha", arguments: { amount: 100 } }),
      ),
    );
    expect(resultOf(preparationBody)).toMatchObject({ isError: true });
    expect(JSON.stringify(preparationBody)).not.toContain("preparation-secret");
    await preparationHost.close();

    const executionLane = controlledBinding("alpha", undefined, () => {
      throw new Error("execution-secret");
    });
    const executionHost = createMcpStatelessHost({ ...source, tools: [executionLane.binding] });
    const executionBody = await responseBody(
      await executionHost.fetch(
        modernRequest("tools/call", { name: "alpha", arguments: { amount: 100 } }),
      ),
    );
    expect(resultOf(executionBody)).toMatchObject({ isError: true });
    expect(JSON.stringify(executionBody)).not.toContain("execution-secret");
    await executionHost.close();
  });
});
