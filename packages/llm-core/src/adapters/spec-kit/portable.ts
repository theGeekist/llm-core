/* eslint-disable sonarjs/cognitive-complexity -- descriptor-safe recursive validation is intentionally centralized */
import { cloneFrozen } from "#shared/portable-data";

const fail = (label: string): never => {
  throw new TypeError(
    `${label} must be closed portable JSON data without getters or sparse arrays.`,
  );
};

const assertPortableDescriptors = (value: unknown, label: string, active: Set<object>): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value !== "object") fail(label);
  const objectValue = value as object;
  if (active.has(objectValue)) fail(label);
  active.add(objectValue);

  const captured = (() => {
    try {
      return {
        prototype: Object.getPrototypeOf(objectValue) as object | null,
        descriptors: Object.getOwnPropertyDescriptors(objectValue),
      };
    } catch {
      return fail(label);
    }
  })();
  const { prototype, descriptors } = captured;

  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) fail(label);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) fail(label);
    const dataKeys = keys.filter((key) => key !== "length") as string[];
    if (dataKeys.length !== value.length || dataKeys.some((key, index) => key !== String(index))) {
      fail(label);
    }
    dataKeys.forEach((key) => {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        fail(label);
      }
      assertPortableDescriptors(descriptor!.value, label, active);
    });
    active.delete(objectValue);
    return;
  }

  if (prototype !== Object.prototype && prototype !== null) fail(label);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail(label);
    const descriptor = descriptors[key as string];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      fail(label);
    }
    assertPortableDescriptors(descriptor!.value, label, active);
  }
  active.delete(objectValue);
};

/**
 * Capture the complete caller value before feature validation.
 *
 * Descriptor inspection rejects accessors without invoking them. Only after
 * the whole tree has crossed that boundary is it cloned and recursively
 * frozen, so later validation cannot observe caller mutation.
 */
export const capturePortable = <T>(value: T, label: string): T => {
  assertPortableDescriptors(value, label, new Set());
  return cloneFrozen(value);
};
