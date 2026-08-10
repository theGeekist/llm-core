import type { ContractVersion, JsonObject } from "#contracts";
import type {
  SpecificationAdapterSupport,
  SpecificationOperation,
} from "@geekist/llm-core/specifications";

export type BmadArtifactKind =
  | "canonical-spec"
  | "planning-artifact"
  | "story"
  | "decision"
  | "sprint-status"
  | "dev-auto-spec"
  | "dev-auto-result"
  | "review"
  | "memlog"
  | "other";

export interface BmadArtifact {
  readonly path: string;
  /** Exact UTF-8 text decoded by the caller; the adapter preserves it verbatim. */
  readonly content: string;
  readonly kind?: BmadArtifactKind;
}

export type BmadDevAutoStatus =
  | "draft"
  | "ready-for-dev"
  | "in-progress"
  | "in-review"
  | "done"
  | "blocked";

export interface BmadParsedOutcome {
  readonly status: BmadDevAutoStatus;
  readonly artifactPath: string;
  readonly blockingCondition?: string;
  readonly reviewLoopIteration?: number;
  readonly baselineRevision?: string;
  readonly finalRevision?: string;
}

export interface BmadFileImportInput {
  readonly version: ContractVersion;
  readonly sourceId: string;
  readonly revision: string;
  readonly observedAt: string;
  readonly artifacts: readonly BmadArtifact[];
}

export interface BmadCliObservationInput {
  readonly command: "bmad";
  readonly argv: readonly ["--version"];
  readonly exitCode: 0;
  readonly observedAt: string;
  readonly stdout: string;
  readonly stderr: string;
}

export interface BmadCliObservation extends BmadCliObservationInput {
  readonly version: "6.10.0";
}

export interface BmadImportedSpecification {
  readonly graph: unknown;
  readonly operation: SpecificationOperation;
  readonly support: readonly [SpecificationAdapterSupport, SpecificationAdapterSupport];
}

export interface ParsedMemoryRecord {
  readonly path: string;
  readonly bodyOrdinal: number;
  readonly raw: string;
  readonly text: string;
  readonly type?: string;
  readonly by?: string;
}

export interface ParsedMemlog {
  readonly path: string;
  readonly frontmatter: JsonObject;
  readonly records: readonly ParsedMemoryRecord[];
}
