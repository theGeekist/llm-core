export type PortableRecord = Record<string, unknown>;

const hasOnlyPortableDataProperties = (value: object): boolean => {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return keys.every((key) => {
    const descriptor = descriptors[key as string];
    return descriptor !== undefined && descriptor.enumerable === true && "value" in descriptor;
  });
};

/**
 * Accept only ordinary or null-prototype records.
 *
 * Class instances and objects with attacker-controlled prototypes are not
 * portable data records, even when their enumerable properties look valid.
 */
export const isPortableRecord = (value: unknown): value is PortableRecord => {
  if (value === null || typeof value !== "object") return false;
  try {
    if (Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return (
      (prototype === Object.prototype || prototype === null) && hasOnlyPortableDataProperties(value)
    );
  } catch {
    return false;
  }
};

/**
 * Verify a closed record shape using own properties for required keys.
 */
export const hasOnlyKeys = (
  value: PortableRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  try {
    if (!isPortableRecord(value)) return false;
    const keys = Reflect.ownKeys(value) as string[];
    const allowed = new Set([...required, ...optional]);
    return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
  } catch {
    return false;
  }
};

export const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ("value" in descriptor) deepFreeze(descriptor.value);
  }
  return value;
};

/**
 * Take an ownership-safe structured clone and recursively freeze it.
 *
 * Callers remain responsible for validating their feature-specific portable
 * shape before trusting the returned value.
 */
export const cloneFrozen = <T>(value: T): T => deepFreeze(structuredClone(value));
