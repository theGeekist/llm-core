/* eslint-disable max-params -- Test builders keep all binding dimensions explicit at call sites. */
import {
  contractVersion,
  coreId,
  digest,
  type CapabilityClaim,
  type ConditionalCapabilityClaim,
  type ContractVersion,
  type EvidenceId,
  type ResourceId,
  type SupportedCapabilityClaim,
} from "#contracts";
import {
  capabilityIdForPort,
  type CapabilityBindingDependencies,
  type CapabilityPortKind,
  type CapabilityPortMap,
  type RuntimeCapabilityBinding,
} from "../../../src/application/capability-bindings/public";

const SHA = digest("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
const VERSION = contractVersion("1.0.0");
const REPORT_ID = coreId<EvidenceId>("0190bd0c-0000-4000-8000-000000000201");
const RESOURCE_ID = coreId<ResourceId>("0190bd0c-0000-4000-8000-000000000202");

export const passingClaim = (
  capabilityId: string,
  implementationId: string,
  version: ContractVersion = VERSION,
): SupportedCapabilityClaim => ({
  capabilityId,
  version,
  status: "supported",
  evidence: {
    result: "pass",
    report: {
      evidenceId: REPORT_ID,
      kind: "evaluation",
      content: {
        resourceId: RESOURCE_ID,
        mediaType: "application/json",
        byteLength: 2,
        digest: SHA,
      },
    },
    suiteId: "llm-core.conformance.capability",
    suiteVersion: VERSION,
    observedAt: "2026-07-30T00:00:00.000Z",
    implementationId,
    implementationVersion: "1.0.0",
  },
});

export const conditionalClaim = (
  capabilityId: string,
  implementationId: string,
): ConditionalCapabilityClaim => ({
  ...passingClaim(capabilityId, implementationId),
  status: "conditional",
  conditions: [{ name: "region", value: "local" }],
});

// Test builders keep all binding dimensions explicit at call sites.
// eslint-disable-next-line max-params
export const runtimeBinding = <TKind extends CapabilityPortKind>(
  kind: TKind,
  bindingId: string,
  port: CapabilityPortMap[TKind],
  claims: readonly CapabilityClaim[] = [],
): RuntimeCapabilityBinding<TKind> => ({
  kind,
  descriptor: {
    bindingId,
    claims: [passingClaim(capabilityIdForPort(kind), bindingId), ...claims],
  },
  port,
});

export const verificationDependencies = (
  verifyEvidence: CapabilityBindingDependencies["verifyEvidence"] = () => true,
): CapabilityBindingDependencies => ({ verifyEvidence });
