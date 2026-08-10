import {
  digest,
  newCoreId,
  type EvidenceId,
  type EvidenceRef,
  type ResourceId,
  type ResourceRef,
} from "@aifsd/llm-core/contracts";

const resource: ResourceRef = {
  resourceId: newCoreId<ResourceId>("0190bd0c-0000-7000-8000-000000002401"),
  mediaType: "application/json",
  byteLength: 42,
  digest: digest("a".repeat(64)),
};

const evidence: EvidenceRef = {
  evidenceId: newCoreId<EvidenceId>("0190bd0c-0000-7000-8000-000000002402"),
  kind: "evaluation",
  content: resource,
};

structuredClone({ resource, evidence });
