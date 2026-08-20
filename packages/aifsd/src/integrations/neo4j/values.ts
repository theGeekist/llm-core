import { digest as createDigest } from "@geekist/llm-core/contracts";
import type {
  EventId,
  JournalCheckpoint,
  ProjectProjection,
} from "../../project-semantics/public.js";

export type Neo4jRecord = Readonly<Record<string, unknown>>;

export const one = (records: readonly Neo4jRecord[]): Neo4jRecord | undefined => records[0];

export const digestValue = (
  algorithm: unknown,
  value: unknown,
): ProjectProjection["projectionDigest"] => {
  if (algorithm !== "sha-256" || typeof value !== "string") {
    throw new TypeError("Neo4j projection digest is malformed");
  }
  return createDigest(value);
};

export const properties = (value: unknown): Neo4jRecord => {
  if (value === null || typeof value !== "object") return {};
  const record = value as Neo4jRecord;
  const nested = record.properties;
  return nested !== null && typeof nested === "object" ? (nested as Neo4jRecord) : record;
};

const integer = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (value !== null && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
};

export const strings = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.map(String) : [];

export const isCanonicalTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

export const checkpoint = (value: Neo4jRecord): JournalCheckpoint => ({
  projectId: String(value.projectId),
  position: integer(value.position),
  lastEventId: value.lastEventId === null ? null : (String(value.lastEventId) as EventId),
  journalDigest: digestValue(value.journalDigestAlgorithm, value.journalDigestValue),
});
