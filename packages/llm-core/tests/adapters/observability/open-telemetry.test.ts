import { describe, expect, it } from "bun:test";
import {
  coreId,
  secretRef,
  spanId,
  traceId,
  type EvidenceId,
  type EventId,
  type RunId,
  type ToolCallId,
} from "../../../src/contracts/public";
import {
  createOpenTelemetryProjector,
  type OpenTelemetryProjection,
} from "../../../src/adapters/observability/open-telemetry";
import {
  redactedNativeExtensions,
  type ToolExecutionEvent,
} from "../../../src/features/evidence/public";
import type { ActionDigest } from "../../../src/features/tooling/runtime";

const EVENT_ID = coreId<EventId>("0190bd0c-0000-7000-8000-000000000081");
const RUN_ID = coreId<RunId>("0190bd0c-0000-7000-8000-000000000082");
const TOOL_CALL_ID = coreId<ToolCallId>("0190bd0c-0000-7000-8000-000000000083");
const RECEIPT_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000084");

const event = (): ToolExecutionEvent => ({
  eventId: EVENT_ID,
  kind: "tool.execution.settled",
  occurredAt: "2026-08-01T07:00:00.000Z",
  sequence: 2,
  runId: RUN_ID,
  toolCallId: TOOL_CALL_ID,
  facts: {
    receiptId: RECEIPT_ID,
    receiptRevision: 2,
    receiptState: "succeeded",
    effectDisposition: "applied",
    actionDigest: {
      algorithm: "hmac-sha-256",
      keyRef: secretRef("vault:do-not-project"),
      value: "digest-secret",
    } as ActionDigest,
  },
  redaction: { kind: "redacted", categories: ["credentials", "native-payload"] },
  extensions: redactedNativeExtensions({ "example.adapter": { marker: "native-detail" } }),
});

const declaration = {
  signal: "span" as const,
  sampling: { kind: "always" as const },
  redaction: "canonical-facts-only" as const,
  delivery: "best-effort" as const,
  retention: "exporter-managed" as const,
};

describe("OpenTelemetry observability projection", () => {
  it("correlates a redacted canonical event without exporting evidence, extensions, or credentials", async () => {
    const exported: OpenTelemetryProjection[] = [];
    const projector = createOpenTelemetryProjector({
      declaration,
      port: { export: async (projection) => void exported.push(projection) },
    });
    const trace = {
      traceId: traceId("0123456789abcdef0123456789abcdef"),
      spanId: spanId("0123456789abcdef"),
    };

    expect(projector.project({ event: event(), trace })).toBe("scheduled");
    expect(exported).toHaveLength(0);
    await Promise.resolve();
    expect(exported).toHaveLength(1);
    expect(exported[0]?.trace).toEqual(trace);
    expect(exported[0]?.attributes).toMatchObject({
      "llm_core.evidence.event_id": EVENT_ID,
      "llm_core.receipt.state": "succeeded",
      "llm_core.redaction.kind": "redacted",
    });
    expect(JSON.stringify(exported[0])).not.toContain("digest-secret");
    expect(JSON.stringify(exported[0])).not.toContain("do-not-project");
    expect(JSON.stringify(exported[0])).not.toContain("native-detail");
  });

  it("isolates exporter failures and never retries a projection", async () => {
    let attempts = 0;
    const projector = createOpenTelemetryProjector({
      declaration,
      port: {
        export: () => {
          attempts += 1;
          return Promise.reject(new Error("collector unavailable"));
        },
      },
    });

    expect(projector.project({ event: event() })).toBe("scheduled");
    expect(attempts).toBe(0);
    await Promise.resolve();
    expect(attempts).toBe(1);
  });

  it("honors declared sampling before a port can observe the event", () => {
    let attempts = 0;
    const projector = createOpenTelemetryProjector({
      declaration: { ...declaration, sampling: { kind: "never" } },
      port: {
        export: async () => {
          attempts += 1;
        },
      },
    });

    expect(projector.project({ event: event() })).toBe("not-sampled");
    expect(attempts).toBe(0);
  });
});
