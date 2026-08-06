import { StrictJsonError, type DeepReadonlyJson, type JsonValue } from "./json-value.js";

const freezeValue = <T>(value: T, visited: WeakSet<object>): T => {
  if (value === null || typeof value !== "object" || visited.has(value)) {
    return value;
  }
  visited.add(value);
  Object.freeze(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ("value" in descriptor) {
      freezeValue(descriptor.value, visited);
    }
  }
  return value;
};

export const deepFreeze = <T extends JsonValue>(value: T): DeepReadonlyJson<T> => {
  try {
    return freezeValue(value, new WeakSet<object>()) as DeepReadonlyJson<T>;
  } catch (error) {
    if (error instanceof StrictJsonError) {
      throw error;
    }
    throw new StrictJsonError("inspection-failed", []);
  }
};
