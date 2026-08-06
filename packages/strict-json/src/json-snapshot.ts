import { deepFreeze } from "./deep-freeze.js";
import { normalize, type FrozenJsonValue } from "./json-value.js";

export const snapshot = (value: unknown): FrozenJsonValue => deepFreeze(normalize(value));
