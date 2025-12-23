import type { ModelTelemetry, AdapterTraceEvent } from "./types";

export const toAdapterTrace = (
  telemetry: ModelTelemetry | undefined,
  existing: AdapterTraceEvent[] = [],
): AdapterTraceEvent[] | undefined => {
  if (!telemetry?.response) {
    return existing.length ? existing : undefined;
  }
  const event: AdapterTraceEvent = {
    name: "provider.response",
    data: {
      id: telemetry.response.id,
      modelId: telemetry.response.modelId,
    },
  };
  if (typeof telemetry.response.timestamp === "number") {
    event.timestamp = telemetry.response.timestamp;
  }
  return existing.concat(event);
};
