import type {
  EvidenceRef,
  InvocationId,
  JsonObject,
  ResourceRef,
  RunId,
  SchemaRef,
  StepId,
} from "#contracts";

export interface ArtifactRef {
  kind: "artifact";
  resource: ResourceRef;
  schema?: SchemaRef;
}

export type ArtifactProvenance =
  | {
      kind: "supplied";
      evidence?: EvidenceRef;
    }
  | {
      kind: "generated";
      invocationId: InvocationId;
      runId?: RunId;
      stepId?: StepId;
      evidence?: EvidenceRef;
    }
  | {
      kind: "derived";
      sources: ArtifactRef[];
      operation: string;
      evidence?: EvidenceRef;
    };

export interface Artifact {
  ref: ArtifactRef;
  provenance: ArtifactProvenance;
  metadata?: JsonObject;
}

export interface ArtifactInput {
  content: ResourceRef;
  schema?: SchemaRef;
  provenance: ArtifactProvenance;
  metadata?: JsonObject;
}
