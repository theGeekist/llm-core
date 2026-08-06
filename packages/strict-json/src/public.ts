export { canonicalize } from "./canonical-json.js";
export { deepFreeze } from "./deep-freeze.js";
export { snapshot } from "./json-snapshot.js";
export { hasExactKeys, isRecord, normalize, StrictJsonError } from "./json-value.js";
export type {
  DeepReadonlyJson,
  FrozenJsonArray,
  FrozenJsonRecord,
  FrozenJsonValue,
  JsonArray,
  JsonPathSegment,
  JsonRecord,
  JsonScalar,
  JsonValue,
  StrictJsonErrorCode,
} from "./json-value.js";
