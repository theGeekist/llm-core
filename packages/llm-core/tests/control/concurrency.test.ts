import { describe, expect, test } from "bun:test";
import { createConcurrencyGate, type ConcurrencyLease } from "../../src/features/control/public";
import { RUN_ID, TOOL_CALL_ID } from "./helpers";

describe("concurrency gate", () => {
  test("exclusive execution follows a distinct serialized path", async () => {
    const gate = createConcurrencyGate();
    const firstShared = await gate.acquire({
      runId: RUN_ID,
      toolCallId: TOOL_CALL_ID,
      mode: "shared",
    });

    let exclusiveLease: ConcurrencyLease | undefined;
    const exclusive = gate
      .acquire({
        runId: RUN_ID,
        toolCallId: TOOL_CALL_ID,
        mode: "exclusive",
      })
      .then((lease) => {
        exclusiveLease = lease;
        return lease;
      });

    let trailingSharedAcquired = false;
    const trailingShared = gate
      .acquire({
        runId: RUN_ID,
        toolCallId: TOOL_CALL_ID,
        mode: "shared",
      })
      .then((lease) => {
        trailingSharedAcquired = true;
        return lease;
      });

    await Promise.resolve();
    expect(exclusiveLease).toBeUndefined();
    expect(trailingSharedAcquired).toBeFalse();

    await firstShared.release();
    const acquiredExclusive = await exclusive;
    expect(acquiredExclusive.request.mode).toBe("exclusive");
    expect(trailingSharedAcquired).toBeFalse();

    await acquiredExclusive.release();
    const acquiredShared = await trailingShared;
    expect(acquiredShared.request.mode).toBe("shared");
    await acquiredShared.release();
  });
});
