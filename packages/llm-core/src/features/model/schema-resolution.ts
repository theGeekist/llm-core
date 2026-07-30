import { createHash } from "node:crypto";
import {
  digest,
  isJsonValue,
  isSchemaRef,
  type Digest,
  type InvocationContext,
  type JsonValue,
  type SchemaRef,
} from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";

declare const registeredSchemaDocumentBrand: unique symbol;

export interface SchemaResolution {
  readonly schema: SchemaRef;
  /** Exact canonical or published UTF-8 bytes identified by `schema.digest`. */
  readonly bytes: Uint8Array;
}

export interface SchemaDocumentResolver {
  resolve(input: SchemaDocumentResolveInput): MaybePromise<SchemaResolution | null>;
}

export interface SchemaDocumentResolveInput {
  readonly schema: SchemaRef;
  readonly context: InvocationContext;
}

export interface RegisteredSchemaDocument {
  readonly schema: SchemaRef;
  readonly document: JsonValue;
  readonly verifiedDigest: Digest;
  readonly [registeredSchemaDocumentBrand]: true;
}

export interface ResolveSchemaDocumentInput {
  readonly schema: SchemaRef;
  readonly context: InvocationContext;
  readonly resolver: SchemaDocumentResolver;
}

const registeredDocuments = new WeakSet<object>();

const sameDigest = (left: Digest, right: Digest): boolean =>
  left.algorithm === right.algorithm && left.value === right.value;

const sameSchema = (left: SchemaRef, right: SchemaRef): boolean =>
  left.schemaId === right.schemaId &&
  left.version === right.version &&
  sameDigest(left.digest, right.digest);

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

const registerResolution = (
  expected: SchemaRef,
  resolution: SchemaResolution | null,
): RegisteredSchemaDocument => {
  if (
    resolution === null ||
    Object.keys(resolution).sort().join(",") !== "bytes,schema" ||
    !isSchemaRef(resolution.schema) ||
    !sameSchema(expected, resolution.schema) ||
    !(resolution.bytes instanceof Uint8Array)
  ) {
    throw new TypeError("Schema resolution must return exact bytes for the requested identity.");
  }
  const bytes = resolution.bytes.slice();
  // ADR-007 establishes Node 22 as the package baseline; hash the published
  // bytes synchronously so a synchronous resolver remains synchronous.
  const verifiedDigest = digest(createHash("sha256").update(bytes).digest("hex"));
  if (!sameDigest(expected.digest, verifiedDigest)) {
    throw new TypeError("Schema resolution bytes do not match the requested SHA-256 digest.");
  }
  let document: unknown;
  try {
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new TypeError("Schema resolution bytes must contain strict UTF-8 JSON.");
  }
  if (!isJsonValue(document)) {
    throw new TypeError("Schema resolution bytes must contain strict JSON.");
  }
  const registered = deepFreeze(
    structuredClone({
      schema: resolution.schema,
      document,
      verifiedDigest,
    }),
  ) satisfies Omit<RegisteredSchemaDocument, typeof registeredSchemaDocumentBrand>;
  registeredDocuments.add(registered);
  return registered as RegisteredSchemaDocument;
};

export const resolveSchemaDocument = (
  input: ResolveSchemaDocumentInput,
): MaybePromise<RegisteredSchemaDocument> => {
  const { schema, context, resolver } = input;
  if (!isSchemaRef(schema)) {
    throw new TypeError("Schema resolution requires a portable SchemaRef.");
  }
  return maybeMap(
    (resolution) => registerResolution(schema, resolution),
    resolver.resolve({
      schema: structuredClone(schema),
      context: structuredClone(context),
    }),
  );
};

export const isRegisteredSchemaDocument = (value: unknown): value is RegisteredSchemaDocument =>
  typeof value === "object" && value !== null && registeredDocuments.has(value);
