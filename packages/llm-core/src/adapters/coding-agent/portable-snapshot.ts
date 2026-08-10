import { types as utilTypes } from "node:util";
import { CodingAgentQualificationError } from "./qualification-error";

export type PortableValue = null | boolean | number | string | PortableValue[] | PortableRecord;
export type PortableRecord = { [key: string]: PortableValue };

const NOT_PRIMITIVE = Symbol("not-primitive");

const primitive = (value: unknown): PortableValue | typeof NOT_PRIMITIVE => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  return NOT_PRIMITIVE;
};

const portableFailure = (message: string): never => {
  throw new CodingAgentQualificationError("non-portable-observation", message);
};

const snapshotArray = (value: unknown[], seen: WeakSet<object>): PortableValue[] => {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    return portableFailure("Observation contains an exotic array.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/.test(key)))
  ) {
    return portableFailure("Observation array has non-index properties.");
  }
  const lengthDescriptor = descriptors["length"] as PropertyDescriptor | undefined;
  if (
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number"
  ) {
    return portableFailure("Observation array has no data length.");
  }
  const result: PortableValue[] = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      return portableFailure("Observation array is sparse or accessor-backed.");
    }
    result.push(visitPortable(descriptor.value, seen));
  }
  return result;
};

const snapshotRecord = (value: object, seen: WeakSet<object>): PortableRecord => {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return portableFailure("Observation contains a non-record object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: PortableRecord = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      return portableFailure("Observation contains a symbol key.");
    }
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      return portableFailure("Observation contains an accessor or hidden property.");
    }
    result[key] = visitPortable(descriptor.value, seen);
  }
  return result;
};

const visitPortable = (value: unknown, seen: WeakSet<object>): PortableValue => {
  const acceptedPrimitive = primitive(value);
  if (acceptedPrimitive !== NOT_PRIMITIVE) return acceptedPrimitive;
  if (value === null) return null;
  if (typeof value !== "object") {
    return portableFailure("Observation is not closed JSON data.");
  }
  if (utilTypes.isProxy(value)) {
    throw new CodingAgentQualificationError(
      "proxy-observation",
      "Observation proxies are rejected before inspection.",
    );
  }
  if (seen.has(value)) {
    throw new CodingAgentQualificationError("cyclic-observation", "Observation contains a cycle.");
  }
  seen.add(value);
  try {
    return Array.isArray(value) ? snapshotArray(value, seen) : snapshotRecord(value, seen);
  } catch (error) {
    if (error instanceof CodingAgentQualificationError) throw error;
    throw new CodingAgentQualificationError(
      "hostile-observation",
      "Observation could not be inspected safely.",
    );
  } finally {
    seen.delete(value);
  }
};

export const snapshotPortable = (input: unknown): PortableValue =>
  visitPortable(input, new WeakSet<object>());
