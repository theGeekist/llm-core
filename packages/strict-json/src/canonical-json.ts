import { normalize, sortedStrings, StrictJsonError, type JsonValue } from "./json-value.js";

const serializeArray = (value: JsonValue[]): string => {
  let serialized = "[";
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0) serialized += ",";
    serialized += serializeValue(value[index] as JsonValue);
  }
  return `${serialized}]`;
};

const serializeRecord = (value: { [key: string]: JsonValue }): string => {
  const keys = sortedStrings(Reflect.ownKeys(value) as string[]);
  let serialized = "{";
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] as string;
    if (index > 0) serialized += ",";
    serialized += `${JSON.stringify(key)}:${serializeValue(value[key] as JsonValue)}`;
  }
  return `${serialized}}`;
};

const serializeValue = (value: JsonValue): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  return Array.isArray(value) ? serializeArray(value) : serializeRecord(value);
};

const serialize = (value: JsonValue): string => {
  try {
    return serializeValue(value);
  } catch (error) {
    if (error instanceof StrictJsonError) {
      throw error;
    }
    throw new StrictJsonError("canonicalization-failed", []);
  }
};

export const canonicalize = (value: unknown): string => serialize(normalize(value));
