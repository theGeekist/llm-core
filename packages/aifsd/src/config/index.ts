// Configuration feature front door. Everything the rest of the system depends
// on crosses here: the portable contract types plus the four-layer operation
// set (validate -> resolve -> lock -> plan -> apply).
// Thin re-exports only; all logic lives in the sibling modules.

export * from "./contract.js";

export { validateManifest } from "./manifest.js";
export { resolveManifest } from "./resolution.js";
export { createConfigurationLock } from "./lock.js";
export { planChanges } from "./plan.js";
export { applyPlan } from "./apply.js";
export { explainConfiguration } from "./explanation.js";
