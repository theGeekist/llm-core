import { describe, expect, it } from "bun:test";
import type { EventSink } from "../../../src/features/evidence/public";
import { executeControlledTool } from "../../../src/features/tooling/runtime";
import { CALL_ID, RUN_ID, baseInput, facts, MemoryJournal } from "./execute-fixtures";

describe("controlled tool execution", () => {
  it("records cancellation before start without invoking the binding", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    const outcome = await executeControlledTool({
      ...input,
      executionControl: {
        isCancellationRequested: () => true,
        onCancellationRequested: () => () => undefined,
      },
    });

    expect(outcome.status).toBe("cancelled");
    expect(executions).toBe(0);
    expect("receipt" in outcome && outcome.receipt.state).toBe("cancelled_before_start");
  });

  it("fails closed on a mismatched concurrency lease", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    let released = false;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    await expect(
      executeControlledTool({
        ...input,
        concurrency: {
          acquire: (request) =>
            Promise.resolve({
              request: { ...request, mode: "shared" },
              release: () => {
                released = true;
              },
            }),
        },
      }),
    ).rejects.toThrow("Concurrency gate returned a mismatched lease.");
    expect(executions).toBe(0);
    expect(released).toBe(true);
  });

  it("records post-start cancellation without treating the request as proof of no effect", async () => {
    const journal = new MemoryJournal();
    let requested = false;
    const handlers = new Set<() => void>();
    const control = {
      isCancellationRequested: () => requested,
      onCancellationRequested: (handler: () => void) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };
    const input = baseInput(journal, () => {
      requested = true;
      handlers.forEach((handler) => handler());
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    const outcome = await executeControlledTool({
      ...input,
      executionControl: control,
    });

    expect(outcome.status).toBe("succeeded");
    expect("receipt" in outcome && outcome.receipt.effectDisposition).toBe("applied");
    expect("receipt" in outcome && outcome.receipt.cancellation).toMatchObject({
      runId: RUN_ID,
      toolCallId: CALL_ID,
    });
    expect("receipt" in outcome && outcome.receipt.history.at(-1)?.reasonCode).toBe(
      "cancellation-requested-effect-completed",
    );
    expect(
      "receipt" in outcome &&
        outcome.receipt.history.some(
          ({ from, to, reasonCode }) =>
            from === "started" &&
            to === "started" &&
            reasonCode === "cancellation-requested-after-start",
        ),
    ).toBe(true);
  });

  it("does not let a pending event sink gate execution", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });
    const never = new Promise<void>(() => undefined);

    const outcome = await executeControlledTool({
      ...input,
      eventSink: { emit: () => never },
    });

    expect(outcome.status).toBe("succeeded");
    expect(executions).toBe(1);
    expect("eventDelivery" in outcome && outcome.eventDelivery).toBe("scheduled");
  });

  it("keeps a durable indeterminate receipt when execution and event delivery fail", async () => {
    const journal = new MemoryJournal();
    const input = baseInput(journal, () => {
      throw new Error("provider may have applied the effect");
    });
    const eventSink: EventSink = {
      emit: () => Promise.reject(new Error("sink unavailable")),
    };

    const outcome = await executeControlledTool({ ...input, eventSink });
    const replay = await executeControlledTool({ ...input, facts: facts(), eventSink });

    expect(outcome.status).toBe("indeterminate");
    expect("receipt" in outcome && outcome.receipt.effectDisposition).toBe("unknown");
    expect("eventDelivery" in outcome && outcome.eventDelivery).toBe("scheduled");
    expect(replay.status).toBe("indeterminate");
  });

  it("never re-executes when terminal receipt persistence fails after an effect", async () => {
    const journal = new MemoryJournal();
    const append = journal.append.bind(journal);
    journal.append = async (request) => {
      if (request.transition.to === "succeeded") {
        throw new Error("durable store unavailable");
      }
      return append(request);
    };
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    const outcome = await executeControlledTool(input);
    const receipt = [...journal.byId.values()][0];
    expect(outcome.status).toBe("indeterminate");
    expect(receipt?.state).toBe("indeterminate");
    const replay = await executeControlledTool({ ...input, facts: facts() });
    expect(replay.status).toBe("indeterminate");
    expect(executions).toBe(1);
  });
});
