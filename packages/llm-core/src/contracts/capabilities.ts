import type { JsonValue, NativeExtensions } from "./extensions.js";
import type { EvidenceRef } from "./schema.js";
import type { ContractVersion, SchemaRef } from "./versioning.js";

/**
 * Stable, namespaced capability identifier such as `llm-core.model.streaming`.
 *
 * @pattern ^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type CapabilityId = string;

/**
 * A portable implementation or binding identifier.
 *
 * @minLength 1
 * @maxLength 255
 * @pattern ^[!-~]+$
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type PortableImplementationId = string;

/** @format date-time */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type ObservationTimestamp = string;

/**
 * A behavior required by an application or another capability.
 */
export interface CapabilityRequirement {
  capabilityId: CapabilityId;
  versionRange?: string;
  required?: boolean;
  constraints?: CapabilityConstraint[];
  extensions?: NativeExtensions;
}

export interface CapabilityConstraint {
  name: string;
  value: JsonValue;
}

/**
 * Evidence that a concrete implementation exhibited a capability.
 *
 * The report is an integrity-bearing, storage-neutral EvidenceRef. It resolves
 * only through the authorized evidence port and never embeds a locator.
 */
export interface ConformanceEvidenceBase {
  report: EvidenceRef;
  suiteId: CapabilityId;
  suiteVersion: ContractVersion;
  observedAt: ObservationTimestamp;
  implementationId: PortableImplementationId;
  implementationVersion: string;
  providerId?: PortableImplementationId;
  providerVersion?: string;
  contractSchema?: SchemaRef;
  extensions?: NativeExtensions;
}

export interface PassingConformanceEvidence extends ConformanceEvidenceBase {
  result: "pass";
}

export interface PartialConformanceEvidence extends ConformanceEvidenceBase {
  result: "partial";
  /** @minItems 1 */
  limitations: CapabilityConstraint[];
}

export interface FailedConformanceEvidence extends ConformanceEvidenceBase {
  result: "fail";
  /** @minItems 1 */
  failures: CapabilityConstraint[];
}

export type ConformanceEvidence =
  | PassingConformanceEvidence
  | PartialConformanceEvidence
  | FailedConformanceEvidence;

/**
 * A versioned, evidence-backed statement about supported behavior.
 *
 * Conditional and unsupported observations remain representable so a
 * resolver can fail explicitly rather than silently downgrade.
 */
export interface CapabilityClaimBase {
  capabilityId: CapabilityId;
  version: ContractVersion;
  additionalEvidence?: ConformanceEvidence[];
  extensions?: NativeExtensions;
}

export interface SupportedCapabilityClaim extends CapabilityClaimBase {
  status: "supported";
  evidence: PassingConformanceEvidence;
}

export interface ConditionalCapabilityClaim extends CapabilityClaimBase {
  status: "conditional";
  evidence: PassingConformanceEvidence | PartialConformanceEvidence;
  /** @minItems 1 */
  conditions: CapabilityConstraint[];
}

export interface UnsupportedCapabilityClaim extends CapabilityClaimBase {
  status: "unsupported";
  evidence: FailedConformanceEvidence;
}

export type CapabilityClaim =
  | SupportedCapabilityClaim
  | ConditionalCapabilityClaim
  | UnsupportedCapabilityClaim;

/**
 * Identifies one configured implementation eligible to satisfy requirements.
 */
export interface CapabilityBinding {
  bindingId: PortableImplementationId;
  /** @minItems 1 */
  claims: CapabilityClaim[];
  extensions?: NativeExtensions;
}
