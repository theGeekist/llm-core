import type {
  CapabilityBinding,
  CapabilityClaim,
  CapabilityRequirement,
  ConformanceEvidence,
} from "./capabilities.js";
import type { ExtensionNamespace } from "./extensions.js";
import type {
  CorrelationId,
  ConversationId,
  DurableJobId,
  EventId,
  EvidenceId,
  InvocationId,
  PrincipalId,
  ProviderSessionId,
  ResourceId,
  RunId,
  SecretId,
  SpanId,
  StepId,
  TenantId,
  ToolCallId,
  TraceFlags,
  TraceId,
} from "./identity.js";
import type { InvocationContext } from "./invocation.js";
import type { EvidenceRef, PortableContent, ResourceRef } from "./schema.js";
import type { SchemaRef } from "./versioning.js";

/**
 * Type-only schema-generation root.
 *
 * Each property names a portable wire root. The generator follows only these
 * types, so runtime validators and factories exported by sibling modules are
 * excluded while `--functions fail` remains enabled.
 *
 * @additionalProperties false
 */
export interface ContractSchemaRoots {
  capabilityBinding: CapabilityBinding;
  capabilityClaim: CapabilityClaim;
  capabilityRequirement: CapabilityRequirement;
  conformanceEvidence: ConformanceEvidence;
  evidenceRef: EvidenceRef;
  invocationContext: InvocationContext;
  portableContent: PortableContent;
  resourceRef: ResourceRef;
  schemaRef: SchemaRef;
  correlationId: CorrelationId;
  conversationId: ConversationId;
  durableJobId: DurableJobId;
  eventId: EventId;
  evidenceId: EvidenceId;
  extensionNamespace: ExtensionNamespace;
  invocationId: InvocationId;
  principalId: PrincipalId;
  providerSessionId: ProviderSessionId;
  resourceId: ResourceId;
  runId: RunId;
  secretId: SecretId;
  spanId: SpanId;
  stepId: StepId;
  tenantId: TenantId;
  toolCallId: ToolCallId;
  traceFlags: TraceFlags;
  traceId: TraceId;
}
