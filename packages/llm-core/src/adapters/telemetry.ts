import type { ModelTelemetry, AdapterTraceEvent } from "./types";

export const toAdapterTrace = (
  telemetry: ModelTelemetry | undefined,
  existing: AdapterTraceEvent[] = [],
): AdapterTraceEvent[] | undefined => {
  if (!telemetry?.response) {
    return existing.length ? existing : undefined;
  }
  const response = telemetry.response;
  const event: AdapterTraceEvent = {
    name: "provider.response",
    data: {
      id: response.id,
      modelId: response.modelId,
    },
  };
  if (typeof response.timestamp === "number") {
    event.timestamp = response.timestamp;
  }
  return existing.concat(event);
};
