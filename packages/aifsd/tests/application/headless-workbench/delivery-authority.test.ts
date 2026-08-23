import { describe, expect, test } from "bun:test";
import type {
  HeadlessWorkbenchDeliveryDependencies,
  HeadlessWorkbenchOperationReceipt,
  HeadlessWorkbenchWireOperation,
} from "../../../src/application/headless-workbench/public.js";
import {
  createHeadlessWorkbenchCli,
  type HeadlessWorkbenchCliDependencies,
} from "../../../src/project-semantics/adapters/cli/public.js";
import {
  HEADLESS_WORKBENCH_MCP_TOOL,
  createHeadlessWorkbenchMcp,
  type HeadlessWorkbenchMcpAuthorizer,
} from "../../../src/project-semantics/adapters/mcp/public.js";
import type { ProjectResult } from "../../../src/project-semantics/public.js";
import type { RepositoryCorpusSource } from "../../../src/project-semantics/adapters/repository-corpus/public.js";

const operation = {
  correlationId: "authority-test",
  kind: "projectStatus",
  operationId: "authority-test-1",
  projectId: "repository:authority-test",
} as const satisfies HeadlessWorkbenchWireOperation;

const approved = (): ProjectResult<HeadlessWorkbenchOperationReceipt> => ({
  ok: true,
  value: {
    correlationId: operation.correlationId,
    kind: operation.kind,
    operationId: operation.operationId,
  },
});

const delivery = () => {
  let dispatches = 0;
  const dependencies: HeadlessWorkbenchDeliveryDependencies = {
    corpusSource: {} as RepositoryCorpusSource,
    workbench: {
      dispatch: async () => {
        dispatches += 1;
        return approved();
      },
    },
  };
  return { dependencies, dispatches: () => dispatches };
};

const denied = {
  ok: false,
  diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
} as const;

const cliAuthoriser = (decision: unknown): HeadlessWorkbenchCliDependencies["authorise"] =>
  (() => decision) as HeadlessWorkbenchCliDependencies["authorise"];

const mcpAuthorizer = (decision: unknown): HeadlessWorkbenchMcpAuthorizer => ({
  authorise: (() => decision) as HeadlessWorkbenchMcpAuthorizer["authorise"],
});

describe("headless workbench delivery authority", () => {
  test("CLI dispatches only for a synchronous exact true decision", async () => {
    const accepted = delivery();
    const acceptedResult = await createHeadlessWorkbenchCli({
      ...accepted.dependencies,
      authorise: () => true,
    }).execute(JSON.stringify(operation));

    expect(acceptedResult.exitCode).toBe(0);
    expect(accepted.dispatches()).toBe(1);

    const rejectedPromise = Promise.reject(new Error("rejected authority"));
    const hostileThenable = Object.defineProperty({}, "then", {
      get: () => {
        throw new Error("then accessor must not be read by the synchronous CLI boundary");
      },
    });
    const decisions: readonly unknown[] = [
      rejectedPromise,
      undefined,
      null,
      false,
      "true",
      1,
      {},
      Promise.resolve(true),
      hostileThenable,
    ];

    for (const decision of decisions) {
      const rejected = delivery();
      const result = await createHeadlessWorkbenchCli({
        ...rejected.dependencies,
        authorise: cliAuthoriser(decision),
      }).execute(JSON.stringify(operation));

      expect(result).toEqual({ exitCode: 1, output: JSON.stringify(denied) });
      expect(rejected.dispatches()).toBe(0);
    }
  });

  test("CLI denies missing, throwing and hostile authoriser properties", async () => {
    const missing = delivery();
    const throwing = delivery();
    const hostile = delivery();
    const cases = [
      missing,
      {
        dependencies: {
          ...throwing.dependencies,
          authorise: () => {
            throw new Error("authority failure");
          },
        },
        dispatches: throwing.dispatches,
      },
      {
        dependencies: new Proxy(hostile.dependencies, {
          get: (target, property, receiver) => {
            if (property === "authorise") throw new Error("hostile authorise accessor");
            return Reflect.get(target, property, receiver);
          },
        }),
        dispatches: hostile.dispatches,
      },
    ] satisfies readonly {
      readonly dependencies: HeadlessWorkbenchCliDependencies;
      readonly dispatches: () => number;
    }[];

    for (const fixture of cases) {
      const result = await createHeadlessWorkbenchCli(fixture.dependencies).execute(
        JSON.stringify(operation),
      );
      expect(result).toEqual({ exitCode: 1, output: JSON.stringify(denied) });
      expect(fixture.dispatches()).toBe(0);
    }
  });

  test("MCP accepts exact true from synchronous and asynchronous authority", async () => {
    for (const decision of [true, Promise.resolve(true)] as const) {
      const accepted = delivery();
      const result = await createHeadlessWorkbenchMcp(
        accepted.dependencies,
        mcpAuthorizer(decision),
      ).callTool(HEADLESS_WORKBENCH_MCP_TOOL, "fixture-actor", operation);

      expect(result.ok).toBeTrue();
      expect(accepted.dispatches()).toBe(1);
    }
  });

  test("MCP denies rejection, hostile thenables and every non-boolean decision", async () => {
    const hostileThenable = Object.defineProperty({}, "then", {
      get: () => {
        throw new Error("hostile then accessor");
      },
    });
    const decisions: readonly unknown[] = [
      undefined,
      null,
      false,
      "true",
      1,
      {},
      Promise.resolve(false),
      Promise.resolve("true"),
      Promise.reject(new Error("rejected authority")),
      hostileThenable,
    ];

    for (const decision of decisions) {
      const rejected = delivery();
      const result = await createHeadlessWorkbenchMcp(
        rejected.dependencies,
        mcpAuthorizer(decision),
      ).callTool(HEADLESS_WORKBENCH_MCP_TOOL, "fixture-actor", operation);

      expect(result).toEqual(denied);
      expect(rejected.dispatches()).toBe(0);
    }
  });

  test("MCP denies throwing calls and hostile authoriser accessors", async () => {
    const authorizers: readonly HeadlessWorkbenchMcpAuthorizer[] = [
      {
        authorise: () => {
          throw new Error("authority failure");
        },
      },
      new Proxy(mcpAuthorizer(true), {
        get: (target, property, receiver) => {
          if (property === "authorise") throw new Error("hostile authorise accessor");
          return Reflect.get(target, property, receiver);
        },
      }),
    ];

    for (const authorizer of authorizers) {
      const rejected = delivery();
      const result = await createHeadlessWorkbenchMcp(rejected.dependencies, authorizer).callTool(
        HEADLESS_WORKBENCH_MCP_TOOL,
        "fixture-actor",
        operation,
      );

      expect(result).toEqual(denied);
      expect(rejected.dispatches()).toBe(0);
    }
  });
});
