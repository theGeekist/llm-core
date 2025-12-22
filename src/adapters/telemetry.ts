import type { AdapterModelTelemetry, AdapterTraceEvent } from "./types";

export const toAdapterTrace = (
  telemetry: AdapterModelTelemetry | undefined,
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
