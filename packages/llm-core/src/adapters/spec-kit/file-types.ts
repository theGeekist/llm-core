import type {
  SpecificationSourceRole,
  SpecificationSourceAuthority,
  SpecificationOperation,
  SpecificationAdapterSupport,
} from "@geekist/llm-core/specifications";

export type SpecKitDocumentKind =
  | "constitution"
  | "overlay"
  | "specification"
  | "plan"
  | "tasks"
  | "workflow"
  | "workflow-state"
  | "other";

export type SpecKitProvenanceTier =
  | "project"
  | "preset"
  | "extension"
  | "core"
  | "workflow-overlay"
  | "feature-artifact"
  | "workflow-run";

/** Native resolver attribution; `order` is zero-based within `resolutionScope`. */
export interface SpecKitFileProvenance {
  readonly tier: SpecKitProvenanceTier;
  readonly providerId: string;
  /** Separates independent native stacks, such as one template path and one workflow. */
  readonly resolutionScope: string;
  readonly order: number;
  readonly priority?: number;
  readonly strategy?: "replace" | "prepend" | "append" | "wrap";
}

export interface SpecKitFile {
  readonly path: string;
  readonly content: string;
  readonly kind: SpecKitDocumentKind;
  readonly provenance: SpecKitFileProvenance;
}

export interface SpecKitFileImportInput {
  readonly observedAt: string;
  /** Distinct source-owned revisions; node and issue bindings retain this grouping. */
  readonly sources: readonly SpecKitFileSource[];
}

export interface SpecKitFileSource {
  readonly sourceId: string;
  readonly revision: string;
  readonly role: SpecificationSourceRole;
  readonly authority: SpecificationSourceAuthority;
  /** Observation order. Native precedence is retained independently in each file's provenance. */
  readonly files: readonly SpecKitFile[];
}

export interface SpecKitFileImportResult {
  /** Detached portable graph input for `loadSpecification`. */
  readonly graph: unknown;
  readonly operation: SpecificationOperation;
  readonly support: readonly [SpecificationAdapterSupport, SpecificationAdapterSupport];
}

export interface GroupedFile {
  readonly source: SpecKitFileSource;
  readonly file: SpecKitFile;
}
