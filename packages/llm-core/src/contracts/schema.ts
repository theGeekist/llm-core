import type { EvidenceId, ResourceId } from "./identity.js";
import type { JsonValue } from "./extensions.js";
import type { Digest, SchemaRef } from "./versioning.js";

/**
 * An IANA media type.
 *
 * @pattern ^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type MediaType = string;

/**
 * A non-negative byte count.
 *
 * @minimum 0
 * @asType integer
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type ByteLength = number;

/**
 * RFC 4648 base64 data.
 *
 * @pattern ^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type Base64Data = string;

/** Storage-neutral identity and integrity metadata for binary content. */
export interface ResourceRef {
  resourceId: ResourceId;
  mediaType: MediaType;
  byteLength: ByteLength;
  digest: Digest;
}

/** Portable UTF-8 text content. */
export interface TextContent {
  kind: "text";
  text: string;
}

/** Portable JSON content with an optional schema identity. */
export interface JsonContent {
  kind: "json";
  value: JsonValue;
  schema?: SchemaRef;
}

/** Portable inline binary content. */
export interface BinaryContent {
  kind: "binary";
  mediaType: MediaType;
  encoding: "base64";
  data: Base64Data;
  byteLength: ByteLength;
  digest: Digest;
}

/** Portable reference to media held behind an authorized resource resolver. */
export interface MediaRefContent {
  kind: "media-ref";
  mediaType: MediaType;
  resource: ResourceRef;
  altText?: string;
}

/** Mandatory closed portable content union. */
export type PortableContent = TextContent | JsonContent | BinaryContent | MediaRefContent;

/** Closed classification for storage-neutral evidence references. */
export type EvidenceKind =
  | "artifact"
  | "checkpoint"
  | "evaluation"
  | "event-payload"
  | "execution-receipt"
  | "other"
  | "tool-arguments"
  | "tool-result";

/**
 * Authorized storage-neutral reference to evidence content.
 *
 * The reference carries no physical locator and does not imply disclosure
 * permission.
 */
export interface EvidenceRef {
  evidenceId: EvidenceId;
  kind: EvidenceKind;
  content: ResourceRef;
  schema?: SchemaRef;
}
