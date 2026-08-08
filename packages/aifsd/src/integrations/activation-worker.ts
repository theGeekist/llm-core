import type { IntegrationResult, IntegrationWorker } from "./contract.js";

const invalidWorker = (): IntegrationResult<IntegrationWorker> => ({
  ok: false,
  diagnostics: [
    {
      code: "activation-grant-invalid",
      reasonCode: "worker-capability-invalid",
    },
  ],
});

export const captureIntegrationWorker = (
  worker: IntegrationWorker,
): IntegrationResult<IntegrationWorker> => {
  try {
    const workerId = worker.workerId;
    const activate = worker.activate.bind(worker);
    return typeof workerId === "string" && workerId.length > 0 && typeof activate === "function"
      ? { ok: true, value: Object.freeze({ workerId, activate }) }
      : invalidWorker();
  } catch {
    return invalidWorker();
  }
};
