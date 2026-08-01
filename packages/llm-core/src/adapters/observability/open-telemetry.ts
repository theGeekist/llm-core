import type { TraceContext } from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import type { ToolExecutionEvent } from "../../features/evidence/public";

export type OpenTelemetrySignal = "span" | "log";

export type OpenTelemetrySampling =
  | { readonly kind: "always" }
  | { readonly kind: "never" }
  | { readonly kind: "composition"; readonly policyId: string };

/**
 * The behavior this adapter declares to its composition.
 *
 * The adapter has no SDK or retention backend. It exports a redacted snapshot
 * at most once; sampling, delivery, and retention are explicit so callers do
 * not mistake an observability projection for durable evidence.
 */
export interface OpenTelemetryProjectionDeclaration {
  readonly signal: OpenTelemetrySignal;
  readonly sampling: OpenTelemetrySampling;
  readonly redaction: "canonical-facts-only";
  readonly delivery: "best-effort";
  readonly retention: "exporter-managed";
}

export interface OpenTelemetryProjection {
  readonly signal: OpenTelemetrySignal;
  readonly name: string;
  readonly occurredAt: string;
  readonly trace?: TraceContext;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

/** A composition-supplied bridge to an OpenTelemetry SDK or collector. */
export interface OpenTelemetryProjectionPort {
  export(projection: OpenTelemetryProjection): Promise<void>;
}

export interface OpenTelemetryProjectionInput {
  readonly event: ToolExecutionEvent;
  /** Trace context is correlation data; it does not alter canonical evidence. */
  readonly trace?: TraceContext;
}

export type OpenTelemetryProjectionDelivery = "not-sampled" | "scheduled" | "failed";

/** The sampler sees only the same safe facts eligible for projection. */
export interface OpenTelemetrySamplingInput {
  readonly eventId: string;
  readonly eventKind: ToolExecutionEvent["kind"];
  readonly runId: string;
  readonly receiptState: ToolExecutionEvent["facts"]["receiptState"];
  readonly redaction: ToolExecutionEvent["redaction"]["kind"];
}

export type OpenTelemetrySampler = (input: OpenTelemetrySamplingInput) => boolean;

export interface CreateOpenTelemetryProjectorInput {
  readonly declaration: OpenTelemetryProjectionDeclaration;
  readonly port: OpenTelemetryProjectionPort;
  /** Required only for a composition-owned sampling declaration. */
  readonly sample?: OpenTelemetrySampler;
}

export interface OpenTelemetryProjector {
  readonly declaration: OpenTelemetryProjectionDeclaration;
  /**
   * Schedule one best-effort projection without awaiting or retrying delivery.
   * Calling this cannot acknowledge, replay, or otherwise influence an effect.
   */
  project(input: OpenTelemetryProjectionInput): OpenTelemetryProjectionDelivery;
}

const snapshotSampling = (value: unknown): OpenTelemetrySampling | null => {
  if (!isPortableRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "always" && hasOnlyKeys(value, ["kind"])) return { kind: "always" };
  if (value.kind === "never" && hasOnlyKeys(value, ["kind"])) return { kind: "never" };
  if (
    value.kind === "composition" &&
    hasOnlyKeys(value, ["kind", "policyId"]) &&
    typeof value.policyId === "string" &&
    value.policyId.length > 0
  ) {
    return { kind: "composition", policyId: value.policyId };
  }
  return null;
};

const snapshotDeclaration = (value: unknown): OpenTelemetryProjectionDeclaration | null => {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["signal", "sampling", "redaction", "delivery", "retention"]) ||
    (value.signal !== "span" && value.signal !== "log") ||
    value.redaction !== "canonical-facts-only" ||
    value.delivery !== "best-effort" ||
    value.retention !== "exporter-managed"
  ) {
    return null;
  }
  const sampling = snapshotSampling(value.sampling);
  return sampling === null
    ? null
    : {
        signal: value.signal,
        sampling,
        redaction: "canonical-facts-only",
        delivery: "best-effort",
        retention: "exporter-managed",
      };
};

const projectionFor = (
  declaration: OpenTelemetryProjectionDeclaration,
  input: OpenTelemetryProjectionInput,
): OpenTelemetryProjection => {
  const { event } = input;
  return cloneFrozen({
    signal: declaration.signal,
    name: `llm-core.${event.kind}`,
    occurredAt: event.occurredAt,
    ...(input.trace === undefined
      ? {}
      : {
          trace: {
            traceId: input.trace.traceId,
            spanId: input.trace.spanId,
            ...(input.trace.traceFlags === undefined ? {} : { traceFlags: input.trace.traceFlags }),
          },
        }),
    attributes: {
      "llm_core.evidence.event_id": event.eventId,
      "llm_core.evidence.kind": event.kind,
      "llm_core.evidence.sequence": event.sequence,
      "llm_core.evidence.run_id": event.runId,
      "llm_core.evidence.tool_call_id": event.toolCallId,
      "llm_core.receipt.id": event.facts.receiptId,
      "llm_core.receipt.revision": event.facts.receiptRevision,
      "llm_core.receipt.state": event.facts.receiptState,
      "llm_core.receipt.effect_disposition": event.facts.effectDisposition,
      "llm_core.redaction.kind": event.redaction.kind,
      "llm_core.evidence.has_step": event.stepId !== undefined,
    },
  });
};

const samplingInputFor = (event: ToolExecutionEvent): OpenTelemetrySamplingInput => ({
  eventId: event.eventId,
  eventKind: event.kind,
  runId: event.runId,
  receiptState: event.facts.receiptState,
  redaction: event.redaction.kind,
});

export const createOpenTelemetryProjector = (
  input: CreateOpenTelemetryProjectorInput,
): OpenTelemetryProjector => {
  const declaration = snapshotDeclaration(input.declaration);
  if (declaration === null || !input.port || typeof input.port.export !== "function") {
    throw new TypeError("OpenTelemetry projection requires a declared best-effort export port.");
  }
  if (declaration.sampling.kind === "composition" && typeof input.sample !== "function") {
    throw new TypeError("Composition-owned OpenTelemetry sampling requires a sampler.");
  }
  if (declaration.sampling.kind !== "composition" && input.sample !== undefined) {
    throw new TypeError("Only composition-owned OpenTelemetry sampling may provide a sampler.");
  }

  const frozenDeclaration = cloneFrozen(declaration);
  const emit = input.port.export.bind(input.port);
  const sample = input.sample;

  return Object.freeze({
    declaration: frozenDeclaration,
    project(projectionInput: OpenTelemetryProjectionInput): OpenTelemetryProjectionDelivery {
      let shouldProject: boolean;
      try {
        shouldProject =
          frozenDeclaration.sampling.kind === "always"
            ? true
            : frozenDeclaration.sampling.kind === "never"
              ? false
              : sample?.(samplingInputFor(projectionInput.event)) === true;
      } catch {
        return "failed";
      }
      if (!shouldProject) return "not-sampled";

      try {
        const projection = projectionFor(frozenDeclaration, projectionInput);
        queueMicrotask(() => {
          try {
            void Promise.resolve(emit(projection)).catch(() => undefined);
          } catch {
            // Delivery is a one-way best-effort projection. It never retries.
          }
        });
        return "scheduled";
      } catch {
        return "failed";
      }
    },
  });
};
