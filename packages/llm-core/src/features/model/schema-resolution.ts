import {
  isDigest,
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
  readonly document: JsonValue;
  readonly verifiedDigest: Digest;
}

export interface SchemaDocumentResolver {
  resolve(schema: SchemaRef, context: InvocationContext): MaybePromise<SchemaResolution | null>;
}

export interface RegisteredSchemaDocument extends SchemaResolution {
  readonly [registeredSchemaDocumentBrand]: true;
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
    Object.keys(resolution).sort().join(",") !== "document,schema,verifiedDigest" ||
    !isSchemaRef(resolution.schema) ||
    !sameSchema(expected, resolution.schema) ||
    !isDigest(resolution.verifiedDigest) ||
    !sameDigest(expected.digest, resolution.verifiedDigest) ||
    !isJsonValue(resolution.document)
  ) {
    throw new TypeError(
      "Schema resolution must preserve trusted schema identity, digest and strict JSON.",
    );
  }
  const registered = deepFreeze(structuredClone(resolution)) as RegisteredSchemaDocument;
  registeredDocuments.add(registered);
  return registered;
};

export const resolveSchemaDocument = (
  schema: SchemaRef,
  context: InvocationContext,
  resolver: SchemaDocumentResolver,
): MaybePromise<RegisteredSchemaDocument> => {
  if (!isSchemaRef(schema)) {
    throw new TypeError("Schema resolution requires a portable SchemaRef.");
  }
  return maybeMap(
    (resolution) => registerResolution(schema, resolution),
    resolver.resolve(structuredClone(schema), structuredClone(context)),
  );
};

export const isRegisteredSchemaDocument = (value: unknown): value is RegisteredSchemaDocument =>
  typeof value === "object" && value !== null && registeredDocuments.has(value);
