import { describe, expect, test } from "bun:test";
import { createMcpStatelessHost } from "../../../src/adapters/protocols/mcp";
import { reconcileControlledToolReceipt } from "../../../src/tools/runtime";
import { coreId, digest, schemaRef, type EvidenceId, type ResourceId } from "#contracts";
import { facts, id } from "../../application/tool-execution/execute-fixtures";
import {
  controlledBinding,
  hostDefinition,
  modernRequest,
  responseBody,
} from "../../adapters/protocols/mcp/fixtures";

const resultOf = (body: Record<string, unknown>): Record<string, unknown> =>
  body.result as Record<string, unknown>;

describe("connector characterization: MCP tool and resource slice", () => {
  test("discovers, prepares, invokes, fails and reconciles through the qualified MCP boundary", async () => {
    const state = {
      discoveries: [] as string[],
      prepared: [] as Array<{ readonly principalId: string; readonly amount: number }>,
      invocations: 0,
    };
    const successful = controlledBinding("ledger.preview", undefined, ({ call }) => ({
      toolCallId: call.toolCallId,
      status: "succeeded" as const,
      content: [
        {
          kind: "text" as const,
          text: `preview:${String((call.arguments as { amount: number }).amount)}`,
        },
      ],
    }));
    const failed = controlledBinding("ledger.commit", undefined, () => {
      state.invocations += 1;
      throw new Error("remote outcome unavailable");
    });
    const originalPrepare = successful.binding.prepareControlledExecution;
    const host = createMcpStatelessHost(
      hostDefinition({
        tools: [
          {
            ...successful.binding,
            prepareControlledExecution: (input) => {
              state.prepared.push({
                principalId: input.principal.id,
                amount: (input.arguments as { amount: number }).amount,
              });
              return originalPrepare(input);
            },
          },
          failed.binding,
        ],
        resources: [
          {
            definition: {
              name: "ledger schema",
              uri: "test://ledger/schema",
              mimeType: "application/schema+json",
            },
            read: ({ uri }) => ({ contents: [{ uri, text: '{"type":"object"}' }] }),
          },
        ],
      }),
    );

    const discovered = await responseBody(await host.fetch(modernRequest("tools/list")));
    state.discoveries.push(
      ...(resultOf(discovered).tools as Array<{ name: string }>).map(({ name }) => name),
    );
    expect(state.discoveries).toEqual(["ledger.commit", "ledger.preview"]);

    const resource = await responseBody(
      await host.fetch(modernRequest("resources/read", { uri: "test://ledger/schema" })),
    );
    expect(resultOf(resource).contents).toEqual([
      { uri: "test://ledger/schema", text: '{"type":"object"}' },
    ]);

    const preview = await responseBody(
      await host.fetch(
        modernRequest("tools/call", { name: "ledger.preview", arguments: { amount: 7 } }),
      ),
    );
    expect(resultOf(preview)).toMatchObject({ content: [{ type: "text", text: "preview:7" }] });
    expect(state.prepared).toEqual([{ principalId: "principal-1", amount: 7 }]);

    const failedResponse = await responseBody(
      await host.fetch(
        modernRequest("tools/call", { name: "ledger.commit", arguments: { amount: 7 } }),
      ),
    );
    expect(resultOf(failedResponse)).toMatchObject({
      content: [{ type: "text", text: "llm-core.controlled-tool.indeterminate" }],
      isError: true,
    });
    expect(Object.keys(resultOf(failedResponse)).sort()).toEqual([
      "_meta",
      "content",
      "isError",
      "resultType",
    ]);
    expect(JSON.stringify(failedResponse)).not.toContain("remote outcome unavailable");
    const receipt = [...failed.journal.byId.values()][0]!;
    expect(receipt.state).toBe("indeterminate");

    failed.journal.now = "2026-08-25T00:02:00.000Z";
    const reconciled = await reconcileControlledToolReceipt({
      receiptId: receipt.receiptId,
      journal: failed.journal,
      receiptOwner: { ownerId: "mcp-application-recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-08-25T00:02:00.000Z" },
      reconciler: {
        reconcile: () =>
          Promise.resolve({
            kind: "known" as const,
            disposition: "applied" as const,
            observedAt: "2026-08-25T00:02:00.000Z",
            evidence: {
              evidenceId: coreId<EvidenceId>(id(70)),
              kind: "execution-receipt" as const,
              content: {
                resourceId: coreId<ResourceId>(id(71)),
                mediaType: "application/json; charset=utf-8",
                byteLength: 2,
                digest: digest("a".repeat(64)),
              },
              schema: schemaRef({
                schemaId: "https://example.test/mcp/ledger-reconciliation",
                version: "1.0.0",
                digest: digest("b".repeat(64)),
              }),
            },
          }),
      },
    });
    expect(reconciled.status).toBe("reconciled");
    expect("receipt" in reconciled && reconciled.receipt.state).toBe("succeeded");
    expect(state.invocations).toBe(1);
    await host.close();
  });
});
