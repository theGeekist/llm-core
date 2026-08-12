import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface StoredPlan<Value> {
  readonly fingerprint: string;
  readonly value: Value;
  readonly version: 1;
}

export interface PlanCache<Value> {
  readonly resolve: (fingerprint: string, create: () => Value) => Value;
}

const storedPlan = <Value>(path: string): StoredPlan<Value> | null => {
  try {
    const candidate = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredPlan<Value>>;
    return candidate.version === 1 && typeof candidate.fingerprint === "string"
      ? (candidate as StoredPlan<Value>)
      : null;
  } catch {
    return null;
  }
};

const persist = <Value>(path: string, value: StoredPlan<Value>): void => {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.next`;
    writeFileSync(temporary, JSON.stringify(value), "utf8");
    renameSync(temporary, path);
  } catch {
    // Cache failure must never make the authoritative planner unavailable.
  }
};

export const createPlanCache = <Value>(path: string): PlanCache<Value> => {
  let current = storedPlan<Value>(path);
  return {
    resolve: (fingerprint, create) => {
      if (current?.fingerprint === fingerprint) return current.value;
      const value = create();
      current = { fingerprint, value, version: 1 };
      persist(path, current);
      return value;
    },
  };
};
