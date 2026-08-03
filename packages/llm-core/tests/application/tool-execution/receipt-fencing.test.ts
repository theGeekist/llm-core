import { describe, expect, it } from "bun:test";
import { type EventId, coreId } from "#contracts";
import { executeControlledTool } from "../../../src/features/tooling/runtime";
import { baseInput, CALL_ID, id, MemoryJournal } from "./execute-fixtures";

describe("controlled tool execution", () => {
  it("fails closed when a receipt fence changes after started and before invocation", async () => {
    const journal = new MemoryJournal();
    const append = journal.append.bind(journal);
    journal.append = async (request) => {
      const result = await append(request);
      if (result.kind === "appended" && request.transition.to === "started") {
        const fence = result.receipt.executionFence;
        if (fence) {
          journal.byId.set(result.receipt.receiptId, {
            ...result.receipt,
            executionFence: {
              ...fence,
              owner: { ownerId: "worker:replacement" },
              token: fence.token + 1,
            },
          });
        }
      }
      return result;
    };
    let executions = 0;
    const outcome = await executeControlledTool(
      baseInput(journal, () => {
        executions += 1;
        return { toolCallId: CALL_ID, status: "succeeded", content: [] };
      }),
    );

    expect(outcome.status).toBe("indeterminate");
    expect(executions).toBe(0);
    expect("receipt" in outcome && outcome.receipt.state).toBe("started");
  });

  it("propagates the fence so a qualified provider rejects takeover after verification", async () => {
    const journal = new MemoryJournal();
    const verifyFence = journal.verifyFence.bind(journal);
    let replaced = false;
    journal.verifyFence = async (request) => {
      const verification = await verifyFence(request);
      if (!replaced && verification.kind === "active") {
        replaced = true;
        journal.now = "2026-07-29T00:02:00.000Z";
        await journal.claim({
          receiptId: verification.receipt.receiptId,
          expectedRevision: verification.receipt.revision,
          owner: { ownerId: "worker:replacement" },
          leaseDurationMs: 60_000,
          transitionId: coreId<EventId>(id(97)),
          redaction: { kind: "not-required" },
        });
      }
      return verification;
    };
    let externalEffects = 0;
    const outcome = await executeControlledTool(
      baseInput(journal, ({ receiptFence }) => {
        const currentReceipt = [...journal.byId.values()][0];
        const current = currentReceipt?.executionFence;
        if (
          !receiptFence ||
          !currentReceipt ||
          !current ||
          receiptFence.receiptId !== currentReceipt.receiptId ||
          receiptFence.token !== current.token ||
          receiptFence.ownerId !== current.owner.ownerId
        ) {
          throw new Error("qualified provider rejected stale receipt fence");
        }
        externalEffects += 1;
        return { toolCallId: CALL_ID, status: "succeeded", content: [] };
      }),
    );

    expect(replaced).toBe(true);
    expect(externalEffects).toBe(0);
    expect(outcome.status).toBe("indeterminate");
  });
});
