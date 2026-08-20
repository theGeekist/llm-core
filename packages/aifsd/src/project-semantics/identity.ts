import type { Digest } from "@geekist/llm-core/contracts";
import type { AcceptedProjectEvent, ProjectContentDigester } from "./contract.js";

export const acceptedEventIdentityInput = (
  event: Omit<AcceptedProjectEvent, "eventDigest">,
): unknown => ({
  eventId: event.eventId,
  projectId: event.projectId,
  kind: event.kind,
  sourceAuthority: event.sourceAuthority,
  admission: event.admission,
  provenance: event.provenance,
  evidence: event.evidence,
  ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
  correlationId: event.correlationId,
  observedAt: event.observedAt,
  admittedAt: event.admittedAt,
  payload: event.payload,
  payloadDigest: event.payloadDigest,
});

export const sameDigest = (left: Digest, right: Digest): boolean =>
  left.algorithm === right.algorithm && left.value === right.value;

export const projectContentDigester = (
  implementation: ProjectContentDigester["digest"],
): ProjectContentDigester => ({ digest: implementation });
