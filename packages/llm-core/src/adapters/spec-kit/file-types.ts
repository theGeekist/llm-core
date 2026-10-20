import { cloneFrozen } from "#shared/portable-data";
import type {
  SpecificationDocumentNodeKind,
  SpecificationSourceRole,
  SpecificationSourceAuthority,
  SpecificationOperation,
  SpecificationAdapterSupport,
} from "@geekist/llm-core/specifications";

/** Native document classes and their exact portable document-node interpretation. */
export const specKitDocumentKinds = cloneFrozen({
  constitution: { nodeKind: "decision", meaning: "Project constitution" },
  overlay: { nodeKind: "decision", meaning: "Source-owned overlay declaration" },
  specification: { nodeKind: "requirement", meaning: "Feature specification" },
  plan: { nodeKind: "plan", meaning: "Implementation plan" },
  tasks: { nodeKind: "plan", meaning: "Source task list" },
  workflow: { nodeKind: "workflow", meaning: "Native workflow program" },
  "workflow-state": {
    nodeKind: "artifact",
    meaning: "Observed local state, never a portable checkpoint",
  },
  other: { nodeKind: "artifact", meaning: "Unclassified source artifact" },
} as const satisfies Readonly<
  Record<string, { readonly nodeKind: SpecificationDocumentNodeKind; readonly meaning: string }>
>);
export type SpecKitDocumentKind = keyof typeof specKitDocumentKinds;

/** Native resolver tiers; order and priority remain independently recorded facts. */
export const specKitProvenanceTiers = [
  "project",
  "preset",
  "extension",
  "core",
  "workflow-overlay",
  "feature-artifact",
  "workflow-run",
] as const;
export type SpecKitProvenanceTier = (typeof specKitProvenanceTiers)[number];
export const specKitResolutionStrategies = ["replace", "prepend", "append", "wrap"] as const;

export const isSpecKitDocumentKind = (value: unknown): value is SpecKitDocumentKind =>
  typeof value === "string" && Object.hasOwn(specKitDocumentKinds, value);

export const isSpecKitProvenanceTier = (value: unknown): value is SpecKitProvenanceTier =>
  typeof value === "string" && specKitProvenanceTiers.some((tier) => tier === value);

export const isSpecKitResolutionStrategy = (
  value: unknown,
): value is (typeof specKitResolutionStrategies)[number] =>
  specKitResolutionStrategies.some((strategy) => strategy === value);

/** Native resolver attribution; `order` is zero-based within `resolutionScope`. */
export interface SpecKitFileProvenance {
  readonly tier: SpecKitProvenanceTier;
  readonly providerId: string;
  /** Separates independent native stacks, such as one template path and one workflow. */
  readonly resolutionScope: string;
  readonly order: number;
  readonly priority?: number;
  readonly strategy?: (typeof specKitResolutionStrategies)[number];
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
