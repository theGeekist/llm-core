import type {
  Digest,
  EvidenceRef,
  InvocationId,
  PortableContent,
  ResourceRef,
  RunId,
  StepId,
} from "#contracts";

export type ContextEntryPriority = "optional" | "preferred" | "required";

export type ContextScope =
  | {
      kind: "invocation";
      invocationId: InvocationId;
    }
  | {
      kind: "run";
      invocationId: InvocationId;
      runId: RunId;
    }
  | {
      kind: "step";
      invocationId: InvocationId;
      runId: RunId;
      stepId: StepId;
    };

export type ContextProvenance =
  | {
      kind: "supplied";
      source: "application" | "system" | "user";
    }
  | {
      kind: "derived";
      operation: string;
      sources: Digest[];
    }
  | {
      kind: "retrieved";
      source: ResourceRef;
      evidence?: EvidenceRef;
    };

export type ContextEntrySource =
  | {
      kind: "content";
      content: PortableContent[];
    }
  | {
      kind: "resource";
      resource: ResourceRef;
    }
  | {
      kind: "evidence";
      evidence: EvidenceRef;
    };

export interface ContextEntryCost {
  bytes: number;
  tokens?: number;
}

export interface ContextEntry {
  identity: Digest;
  source: ContextEntrySource;
  provenance: ContextProvenance;
  priority: ContextEntryPriority;
  cost: ContextEntryCost;
}

export interface ContextBudget {
  maxEntries: number;
  maxBytes: number;
  maxTokens?: number;
}

export interface ContextBudgetUsage {
  entries: number;
  bytes: number;
  tokens?: number;
}

export interface ContextManifest {
  identity: Digest;
  scope: ContextScope;
  budget: ContextBudget;
  usage: ContextBudgetUsage;
  entries: ContextEntry[];
}

export interface ContextEntryInput {
  source: ContextEntrySource;
  provenance: ContextProvenance;
  priority: ContextEntryPriority;
  tokens?: number;
}

export interface ContextManifestInput {
  scope: ContextScope;
  budget: ContextBudget;
  entries: ContextEntryInput[];
}
