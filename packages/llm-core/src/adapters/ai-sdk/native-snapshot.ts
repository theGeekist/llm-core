import { isProxy } from "node:util/types";
import type { ContentPart, GeneratedFile, StepResult, TextStreamPart, ToolSet } from "ai";
import { APICallError } from "@ai-sdk/provider";
import type { JsonValue } from "#contracts";

const malformed = (path: string): never => {
  throw new TypeError(`AI SDK native data at ${path} is not a safe portable value.`);
};

const engineErrorKeys = new Set([
  "message",
  "name",
  "cause",
  "stack",
  "originalLine",
  "originalColumn",
  "line",
  "column",
  "sourceURL",
]);

const ownData = (value: object, key: string, path: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) return malformed(`${path}.${key}`);
  return descriptor.value;
};

const optionalOwnData = (
  value: object,
  key: string,
  path: string,
): { found: false } | { found: true; value: unknown } => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return { found: false };
  if (!("value" in descriptor)) return malformed(`${path}.${key}`);
  return { found: true, value: descriptor.value };
};

const assertClosedDescriptors = (input: {
  value: object;
  path: string;
  allowed: ReadonlySet<string>;
  allowedSymbols?: ReadonlySet<symbol>;
}): PropertyDescriptorMap => {
  const allowedSymbols = input.allowedSymbols ?? new Set<symbol>();
  const descriptors = Object.getOwnPropertyDescriptors(input.value) as PropertyDescriptorMap;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === "symbol") {
      if (!allowedSymbols.has(key)) malformed(input.path);
    } else if (!input.allowed.has(key)) {
      malformed(`${input.path}.${key}`);
    }
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) malformed(`${input.path}.${String(key)}`);
  }
  return descriptors;
};

type SnapshotContext = { path: string; seen: Set<object>; allowUndefined: boolean };

const nested = (context: SnapshotContext, path: string): SnapshotContext => ({
  ...context,
  path,
});

const snapshotArray = (value: unknown[], context: SnapshotContext): JsonValue[] => {
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap;
  const length = descriptors["length"];
  const arrayLength = length && "value" in length ? length.value : malformed(context.path);
  if (typeof arrayLength !== "number") malformed(context.path);
  const expectedKeys = new Set<PropertyKey>(["length"]);
  const result: JsonValue[] = [];
  for (let index = 0; index < arrayLength; index += 1) {
    const key = String(index);
    expectedKeys.add(key);
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      malformed(`${context.path}[${index}]`);
    }
    result.push(
      snapshot(
        (descriptor as PropertyDescriptor).value,
        nested(context, `${context.path}[${index}]`),
      ),
    );
  }
  if (Reflect.ownKeys(descriptors).some((key) => !expectedKeys.has(key))) malformed(context.path);
  return result;
};

export const assertAiSdk7ClosedArray: (
  value: unknown,
  path: string,
) => asserts value is unknown[] = (value, path) => {
  if (!Array.isArray(value) || isProxy(value)) malformed(path);
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap;
  const length = descriptors["length"];
  const arrayLength = length && "value" in length ? length.value : malformed(path);
  if (typeof arrayLength !== "number") malformed(path);
  const expectedKeys = new Set<PropertyKey>(["length"]);
  for (let index = 0; index < arrayLength; index += 1) {
    const key = String(index);
    expectedKeys.add(key);
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      malformed(`${path}[${index}]`);
    }
  }
  if (Reflect.ownKeys(descriptors).some((key) => !expectedKeys.has(key))) malformed(path);
};

const snapshotRecord = (value: object, context: SnapshotContext): JsonValue => {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) malformed(context.path);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) malformed(context.path);
  const result: Record<string, JsonValue> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) malformed(`${context.path}.${key}`);
    result[key] = snapshot(descriptor.value, nested(context, `${context.path}.${key}`));
  }
  return result;
};

const errorString = (value: Error, key: "name" | "message", path: string): string => {
  if (value instanceof DOMException) {
    const result = Object.getOwnPropertyDescriptor(DOMException.prototype, key)?.get?.call(value);
    return typeof result === "string" ? result : malformed(`${path}.${key}`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return key === "name" ? "Error" : malformed(`${path}.${key}`);
  return "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : malformed(`${path}.${key}`);
};

const apiCallErrorSnapshot = (value: APICallError, path: string, seen: Set<object>): JsonValue => {
  const markerSymbols = new Set([
    Symbol.for("vercel.ai.error"),
    Symbol.for("vercel.ai.error.AI_APICallError"),
  ]);
  const allowed = new Set([
    ...engineErrorKeys,
    "url",
    "requestBodyValues",
    "statusCode",
    "responseHeaders",
    "responseBody",
    "isRetryable",
    "data",
  ]);
  const descriptors = assertClosedDescriptors({
    value,
    path,
    allowed,
    allowedSymbols: markerSymbols,
  });
  for (const marker of markerSymbols) {
    if (descriptors[marker]?.value !== true) malformed(path);
  }
  return {
    family: "api-call-error",
    name: errorString(value, "name", path),
    message: errorString(value, "message", path),
    url: snapshot(ownData(value, "url", path), { path: `${path}.url`, seen, allowUndefined: true }),
    requestBodyValues: snapshot(ownData(value, "requestBodyValues", path), {
      path: `${path}.requestBodyValues`,
      seen,
      allowUndefined: true,
    }),
    statusCode: snapshotOptional({ value, key: "statusCode", path, seen }),
    responseHeaders: snapshotOptional({ value, key: "responseHeaders", path, seen }),
    responseBody: snapshotOptional({ value, key: "responseBody", path, seen }),
    isRetryable: snapshot(ownData(value, "isRetryable", path), {
      path: `${path}.isRetryable`,
      seen,
      allowUndefined: false,
    }),
    data: snapshotOptional({ value, key: "data", path, seen }),
    cause: snapshotOptional({ value, key: "cause", path, seen }),
  };
};

const errorSnapshot = (value: Error, path: string, seen: Set<object>): JsonValue => {
  if (value instanceof APICallError) return apiCallErrorSnapshot(value, path, seen);
  if (value instanceof DOMException) {
    return {
      family: "abort-error",
      name: errorString(value, "name", path),
      message: errorString(value, "message", path),
    };
  }
  assertClosedDescriptors({ value, path, allowed: engineErrorKeys });
  return {
    family: "error",
    name: errorString(value, "name", path),
    message: errorString(value, "message", path),
    cause: snapshotOptional({ value, key: "cause", path, seen }),
  };
};

const snapshotOptional = (input: {
  value: object;
  key: string;
  path: string;
  seen: Set<object>;
}): JsonValue => {
  const optional = optionalOwnData(input.value, input.key, input.path);
  return snapshot(optional.found ? optional.value : undefined, {
    path: `${input.path}.${input.key}`,
    seen: input.seen,
    allowUndefined: true,
  });
};

const snapshot = (value: unknown, context: SnapshotContext): JsonValue => {
  if (value === undefined) return context.allowUndefined ? null : malformed(context.path);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value !== "object" || isProxy(value)) return malformed(context.path);
  if (context.seen.has(value)) return malformed(context.path);
  context.seen.add(value);
  try {
    if (value instanceof Date) return Date.prototype.toISOString.call(value);
    if (value instanceof Error) return errorSnapshot(value, context.path, context.seen);
    return Array.isArray(value) ? snapshotArray(value, context) : snapshotRecord(value, context);
  } finally {
    context.seen.delete(value);
  }
};

const deepFreeze = <T extends JsonValue>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const snapshotAiSdk7Native = (value: unknown, path: string): JsonValue =>
  snapshot(value, { path, seen: new Set(), allowUndefined: false });

export const snapshotAiSdk7Known = (value: unknown, path: string): JsonValue =>
  snapshot(value, { path, seen: new Set(), allowUndefined: true });

export const cloneFrozenAiSdk7Json = (value: unknown, path: string): JsonValue =>
  deepFreeze(snapshotAiSdk7Native(value, path));

const bytesToBase64 = (bytes: Uint8Array): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += alphabet[first >> 2];
    result += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    result += second === undefined ? "=" : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    result += third === undefined ? "=" : alphabet[third & 63];
  }
  return result;
};

const snapshotByteRepresentation = (value: unknown, path: string): string => {
  if (typeof value !== "object" || value === null || isProxy(value)) return malformed(path);
  if (Object.getPrototypeOf(value) !== Uint8Array.prototype || !(value instanceof Uint8Array)) {
    return malformed(path);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = new Set(Array.from({ length: value.length }, (_, index) => String(index)));
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !expected.has(key)) return malformed(path);
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      return malformed(`${path}.${String(key)}`);
    }
  }
  if (Reflect.ownKeys(descriptors).length !== expected.size) return malformed(path);
  return bytesToBase64(value);
};

const generatedFileBase64 = (file: object, path: string): string => {
  const representations = [
    ["base64", optionalOwnData(file, "base64", path)],
    ["base64Data", optionalOwnData(file, "base64Data", path)],
    ["uint8Array", optionalOwnData(file, "uint8Array", path)],
    ["uint8ArrayData", optionalOwnData(file, "uint8ArrayData", path)],
  ] as const;
  const encoded: string[] = [];
  for (const [key, representation] of representations) {
    if (!representation.found || representation.value === undefined) continue;
    if (key === "base64" || key === "base64Data") {
      if (typeof representation.value !== "string") return malformed(`${path}.${key}`);
      encoded.push(representation.value);
    } else {
      encoded.push(snapshotByteRepresentation(representation.value, `${path}.${key}`));
    }
  }
  if (encoded.length === 0 || encoded.some((value) => value !== encoded[0])) {
    return malformed(`${path}.base64`);
  }
  return encoded[0]!;
};

const assertNoProviderExecution = (value: JsonValue, path: string): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoProviderExecution(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const type = value["type"];
  if (
    (type === "tool-call" || type === "tool-result" || type === "tool-input-start") &&
    value["providerExecuted"] === true
  ) {
    malformed(path);
  }
  for (const [key, child] of Object.entries(value)) {
    assertNoProviderExecution(child, `${path}.${key}`);
  }
};

export const snapshotAiSdk7GeneratedFile = (file: GeneratedFile, path: string): JsonValue => {
  if (typeof file !== "object" || file === null || isProxy(file)) return malformed(path);
  assertClosedDescriptors({
    value: file,
    path,
    allowed: new Set(["type", "mediaType", "base64", "uint8Array", "base64Data", "uint8ArrayData"]),
  });
  const mediaType = ownData(file, "mediaType", path);
  if (typeof mediaType !== "string" || mediaType.length === 0)
    return malformed(`${path}.mediaType`);
  const type = optionalOwnData(file, "type", path);
  if (type.found && type.value !== "file") return malformed(`${path}.type`);
  return {
    ...(type.found ? { type: "file" } : {}),
    mediaType,
    base64: generatedFileBase64(file, path),
  };
};

export const snapshotAiSdk7Part = (
  part: ContentPart<ToolSet> | TextStreamPart<ToolSet>,
  path: string,
): { kind: string; value: JsonValue } => {
  if (typeof part !== "object" || part === null || isProxy(part)) malformed(path);
  const typeValue = ownData(part, "type", path);
  const type = typeof typeValue === "string" ? typeValue : malformed(`${path}.type`);
  if (type === "raw") malformed(path);
  const providerExecuted = optionalOwnData(part, "providerExecuted", path);
  if (
    providerExecuted.found &&
    providerExecuted.value !== undefined &&
    typeof providerExecuted.value !== "boolean"
  ) {
    malformed(`${path}.providerExecuted`);
  }
  if (providerExecuted.found && providerExecuted.value === true) malformed(path);
  if (type !== "file" && type !== "reasoning-file") {
    const value = snapshotAiSdk7Native(part, path);
    assertNoProviderExecution(value, path);
    return { kind: type, value };
  }
  assertClosedDescriptors({
    value: part,
    path,
    allowed: new Set(["type", "file", "providerMetadata"]),
  });
  const providerMetadata = optionalOwnData(part, "providerMetadata", path);
  return {
    kind: type,
    value: {
      type,
      file: snapshotAiSdk7GeneratedFile(
        ownData(part, "file", path) as GeneratedFile,
        `${path}.file`,
      ),
      ...(!providerMetadata.found
        ? {}
        : {
            providerMetadata: snapshotAiSdk7Native(
              providerMetadata.value,
              `${path}.providerMetadata`,
            ),
          }),
    },
  };
};

export const snapshotAiSdk7Step = (step: StepResult<ToolSet>, path: string): JsonValue => {
  if (typeof step !== "object" || step === null || isProxy(step)) malformed(path);
  const content = ownData(step, "content", path);
  assertAiSdk7ClosedArray(content, `${path}.content`);
  return {
    callId: snapshotAiSdk7Native(ownData(step, "callId", path), `${path}.callId`),
    stepNumber: snapshotAiSdk7Native(ownData(step, "stepNumber", path), `${path}.stepNumber`),
    content: content.map(
      (part, index) =>
        snapshotAiSdk7Part(part as ContentPart<ToolSet>, `${path}.content[${index}]`).value,
    ),
    finishReason: snapshotAiSdk7Native(ownData(step, "finishReason", path), `${path}.finishReason`),
    rawFinishReason: snapshotAiSdk7Known(
      ownData(step, "rawFinishReason", path),
      `${path}.rawFinishReason`,
    ),
    usage: snapshotAiSdk7Known(ownData(step, "usage", path), `${path}.usage`),
    performance: snapshotAiSdk7Known(ownData(step, "performance", path), `${path}.performance`),
    warnings: snapshotAiSdk7Known(ownData(step, "warnings", path), `${path}.warnings`),
    request: snapshotAiSdk7Known(ownData(step, "request", path), `${path}.request`),
    response: snapshotAiSdk7Known(ownData(step, "response", path), `${path}.response`),
    providerMetadata: snapshotAiSdk7Known(
      ownData(step, "providerMetadata", path),
      `${path}.providerMetadata`,
    ),
  };
};
