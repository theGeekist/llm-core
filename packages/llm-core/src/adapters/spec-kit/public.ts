/* eslint-disable max-lines -- this public adapter front binds the complete pinned file/CLI contract */
import { createHash } from "node:crypto";
import {
  contractVersion,
  digest,
  extensionNamespace,
  type JsonObject,
  type JsonValue,
} from "#contracts";
import { compareUtf16CodeUnits } from "#shared/fp";
import { hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import {
  createSpecificationAdapterSupport,
  createSpecificationOperation,
  createSpecificationSourceSnapshot,
  type SpecificationDiagnostic,
  type SpecificationAdapterSupport,
  type SpecificationFormat,
  type SpecificationOperation,
  type SpecificationSourceAuthority,
  type SpecificationSourceRole,
} from "@geekist/llm-core/specifications";
import {
  SPEC_KIT_ASSESSED_CLI_VERSION,
  observeSpecKitCliVersion,
  observeSpecKitWorkflowStatus,
  type SpecKitCliVersionInput,
  type SpecKitCliVersionObservation,
  type SpecKitGateStatus,
  type SpecKitRunCommandObservation,
  type SpecKitRunCommandStatus,
  type SpecKitRunListItem,
  type SpecKitRunListStatusObservation,
  type SpecKitRunOutcome,
  type SpecKitRunStatus,
  type SpecKitSingleRunStatusObservation,
  type SpecKitStepStatus,
  type SpecKitWorkflowStatusInput,
  type SpecKitWorkflowStatusObservation,
} from "./cli";
import {
  isSpecKitWorkflowOverlayDisabled,
  parseSpecKitWorkflowOverlay,
  type SpecKitOverlayOperation,
  type SpecKitWorkflowOverlayEdit,
  type SpecKitWorkflowOverlayParseIssue,
  type SpecKitWorkflowOverlayParseResult,
  type SpecKitWorkflowOverlayProgram,
} from "./overlay";
import { capturePortable } from "./portable";
import {
  parseSpecKitWorkflow,
  type SpecKitBuiltInStepType,
  type SpecKitWorkflowParseIssue,
  type SpecKitWorkflowParseResult,
  type SpecKitWorkflowProgram,
  type SpecKitWorkflowStep,
} from "./workflow";

export {
  SPEC_KIT_ASSESSED_CLI_VERSION,
  observeSpecKitCliVersion,
  observeSpecKitWorkflowStatus,
  parseSpecKitWorkflow,
  parseSpecKitWorkflowOverlay,
};
export type {
  SpecKitBuiltInStepType,
  SpecKitCliVersionInput,
  SpecKitCliVersionObservation,
  SpecKitGateStatus,
  SpecKitOverlayOperation,
  SpecKitRunCommandObservation,
  SpecKitRunCommandStatus,
  SpecKitRunListItem,
  SpecKitRunListStatusObservation,
  SpecKitRunOutcome,
  SpecKitRunStatus,
  SpecKitSingleRunStatusObservation,
  SpecKitStepStatus,
  SpecKitWorkflowParseIssue,
  SpecKitWorkflowParseResult,
  SpecKitWorkflowProgram,
  SpecKitWorkflowOverlayEdit,
  SpecKitWorkflowOverlayParseIssue,
  SpecKitWorkflowOverlayParseResult,
  SpecKitWorkflowOverlayProgram,
  SpecKitWorkflowStatusInput,
  SpecKitWorkflowStatusObservation,
  SpecKitWorkflowStep,
};

/** The examined Spec Kit CLI/source snapshot. New versions need qualification. */
export const SPEC_KIT_ASSESSED_VERSION = contractVersion("0.14.3-dev.0");
export const SPEC_KIT_ASSESSED_COMMIT = "c0fe0e43cd728ebc3dd1f714343f3921510a157f" as const;

export const SPEC_KIT_FILE_FORMAT: SpecificationFormat = Object.freeze({
  id: extensionNamespace("io.github.spec-kit.file"),
  version: SPEC_KIT_ASSESSED_VERSION,
});

export const SPEC_KIT_CLI_FORMAT: SpecificationFormat = Object.freeze({
  id: extensionNamespace("io.github.spec-kit.cli"),
  version: SPEC_KIT_ASSESSED_VERSION,
});

const CORE_WORKFLOW_FIXTURE_DIGEST = digest(
  "a3b7c17724df02c7f2ad4cfc58435dd428f11eaa13bd07fa5e46f7726142b2b7",
);
const CONTROL_WORKFLOW_FIXTURE_DIGEST = digest(
  "a2631cc76387ca38e34bf81c15642ba01d1c96c06117abc8ae29539ef2c79aed",
);
const WORKFLOW_OVERLAY_FIXTURE_DIGEST = digest(
  "a2dfdf7d2d537839fb372080b3b686f48600f7d41e2fc62cbf5c75e6fff31fbb",
);
const RUN_FAILED_FIXTURE_DIGEST = digest(
  "f46099d9b5ea9084e61960e8573611bb6cda96e95d57b206511ae71ac8826c4c",
);
const RESUME_PAUSED_FIXTURE_DIGEST = digest(
  "7518e3629f4c6fc50d96bab10d8f133fa11eb0f8a5693245f1c020bd1990dad4",
);
const STATUS_RUN_FIXTURE_DIGEST = digest(
  "47769f97ff86560daff2c36ea0d66ea76e4420638ff1ccb6555675d675defaec",
);
const STATUS_LIST_FIXTURE_DIGEST = digest(
  "a29906b64f65c0f16edad07a2175b9dd855ebbadea498f5ac05c87fcee80331a",
);
const sha256 = (value: string) => digest(createHash("sha256").update(value).digest("hex"));

export const SPEC_KIT_FILE_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport(
  {
    format: SPEC_KIT_FILE_FORMAT,
    authority: "Spec Kit repository",
    revision: SPEC_KIT_ASSESSED_COMMIT,
    sourceOwnership: "source-owned",
    operations: [
      createSpecificationOperation({
        operation: "observe-native-source",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "supported",
        fixtures: [
          { fixtureId: "spec-kit.workflow.core.c0fe0e4", digest: CORE_WORKFLOW_FIXTURE_DIGEST },
          {
            fixtureId: "spec-kit.workflow.overlay.installed.c0fe0e4",
            digest: WORKFLOW_OVERLAY_FIXTURE_DIGEST,
          },
        ],
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "derive-portable-specification",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "supported",
        fixtures: [
          { fixtureId: "spec-kit.workflow.core.c0fe0e4", digest: CORE_WORKFLOW_FIXTURE_DIGEST },
          {
            fixtureId: "spec-kit.workflow.control-flow.c0fe0e4",
            digest: CONTROL_WORKFLOW_FIXTURE_DIGEST,
          },
          {
            fixtureId: "spec-kit.workflow.overlay.installed.c0fe0e4",
            digest: WORKFLOW_OVERLAY_FIXTURE_DIGEST,
          },
        ],
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "compile-portable-specification",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "unsupported",
        reason: "Spec Kit portable compilation is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "export-native-source",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "unsupported",
        reason: "Spec Kit native export is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "round-trip-native-source",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "unsupported",
        reason: "Spec Kit native round trip is not implemented.",
        diagnostics: [],
      }),
    ],
  },
);

export const SPEC_KIT_CLI_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport({
  format: SPEC_KIT_CLI_FORMAT,
  authority: "Spec Kit repository CLI",
  revision: SPEC_KIT_ASSESSED_COMMIT,
  sourceOwnership: "source-owned",
  operations: [
    createSpecificationOperation({
      operation: "observe-native-source",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "supported",
      fixtures: [
        { fixtureId: "spec-kit.cli.run-failed.c0fe0e4", digest: RUN_FAILED_FIXTURE_DIGEST },
        { fixtureId: "spec-kit.cli.resume-paused.c0fe0e4", digest: RESUME_PAUSED_FIXTURE_DIGEST },
        { fixtureId: "spec-kit.cli.status-run.c0fe0e4", digest: STATUS_RUN_FIXTURE_DIGEST },
        { fixtureId: "spec-kit.cli.status-list.c0fe0e4", digest: STATUS_LIST_FIXTURE_DIGEST },
      ],
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "derive-portable-specification",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "unsupported",
      reason: "Spec Kit CLI portable derivation is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "compile-portable-specification",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "unsupported",
      reason: "Spec Kit CLI portable compilation is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "export-native-source",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "unsupported",
      reason: "Spec Kit CLI native export is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "round-trip-native-source",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "unsupported",
      reason: "Spec Kit CLI native round trip is not implemented.",
      diagnostics: [],
    }),
  ],
});

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

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> =>
  isPortableRecord(value) && hasOnlyKeys(value, required, optional);
const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const assertInput = (input: SpecKitFileImportInput): void => {
  if (
    !exact(input, ["observedAt", "sources"]) ||
    !Array.isArray(input.sources) ||
    input.sources.length === 0
  ) {
    throw new TypeError("Spec Kit file input must use the closed adapter shape.");
  }
  const sourceIds = new Set<string>();
  input.sources.forEach((source) => {
    if (
      !exact(source, ["sourceId", "revision", "role", "authority", "files"]) ||
      !nonBlank(source.sourceId) ||
      !nonBlank(source.revision) ||
      !["primary", "overlay", "reference", "generated"].includes(String(source.role)) ||
      !["authoritative", "advisory", "informative"].includes(String(source.authority)) ||
      !Array.isArray(source.files) ||
      source.files.length === 0 ||
      sourceIds.has(source.sourceId)
    ) {
      throw new TypeError(
        "Spec Kit imports require unique source groups with explicit role, authority, revision, and files.",
      );
    }
    sourceIds.add(source.sourceId);
    const paths = new Set<string>();
    source.files.forEach((file) => {
      if (
        !exact(file, ["path", "content", "kind", "provenance"]) ||
        !nonBlank(file.path) ||
        typeof file.content !== "string" ||
        ![
          "constitution",
          "overlay",
          "specification",
          "plan",
          "tasks",
          "workflow",
          "workflow-state",
          "other",
        ].includes(String(file.kind)) ||
        !exact(
          file.provenance,
          ["tier", "providerId", "resolutionScope", "order"],
          ["priority", "strategy"],
        ) ||
        ![
          "project",
          "preset",
          "extension",
          "core",
          "workflow-overlay",
          "feature-artifact",
          "workflow-run",
        ].includes(String(file.provenance.tier)) ||
        !nonBlank(file.provenance.providerId) ||
        !nonBlank(file.provenance.resolutionScope) ||
        typeof file.provenance.order !== "number" ||
        !Number.isInteger(file.provenance.order) ||
        file.provenance.order < 0 ||
        (file.provenance.priority !== undefined &&
          (typeof file.provenance.priority !== "number" ||
            !Number.isInteger(file.provenance.priority) ||
            file.provenance.priority < 0)) ||
        (file.provenance.strategy !== undefined &&
          !["replace", "prepend", "append", "wrap"].includes(String(file.provenance.strategy)))
      ) {
        throw new TypeError(
          "Spec Kit files require explicit native provenance and resolution scope.",
        );
      }
      if (paths.has(file.path)) {
        throw new TypeError("Spec Kit source paths must be unique.");
      }
      paths.add(file.path);
    });
  });
};

interface GroupedFile {
  readonly source: SpecKitFileSource;
  readonly file: SpecKitFile;
}

const groupedFiles = (input: SpecKitFileImportInput): readonly GroupedFile[] =>
  input.sources.flatMap((source) => source.files.map((file) => ({ source, file })));

const nodeKindFor = (kind: SpecKitDocumentKind) => {
  if (kind === "constitution" || kind === "overlay") return "decision" as const;
  if (kind === "specification") return "requirement" as const;
  if (kind === "plan" || kind === "tasks") return "plan" as const;
  if (kind === "workflow") return "workflow" as const;
  return "artifact" as const;
};

const titleFor = (file: SpecKitFile): string => {
  for (const line of file.content.split("\n")) {
    const heading = line.trimStart();
    if (heading.startsWith("# ") && heading.slice(2).trim().length > 0) {
      return heading.slice(2).trim();
    }
  }
  return file.path;
};

const issueForFile = (
  sourceId: string,
  file: SpecKitFile,
  issue: SpecKitWorkflowParseIssue | SpecKitWorkflowOverlayParseIssue,
): SpecificationDiagnostic => ({
  code: issue.code,
  severity: issue.impact === "blocking" ? "error" : "warning",
  impact: issue.impact,
  explanation: issue.explanation,
  source: {
    sourceId: sourceId as never,
    documentId: file.path,
    ...(issue.location === undefined ? {} : { location: issue.location }),
  },
});

const workflowResults = (
  files: readonly GroupedFile[],
): ReadonlyMap<SpecKitFile, SpecKitWorkflowParseResult> =>
  new Map(
    files
      .map(({ file }) => file)
      .filter((file) => file.kind === "workflow")
      .map((file) => [file, parseSpecKitWorkflow(file.content)]),
  );

const overlayResults = (
  files: readonly GroupedFile[],
): ReadonlyMap<SpecKitFile, SpecKitWorkflowOverlayParseResult> =>
  new Map(
    files
      .map(({ file }) => file)
      .filter(
        (file) =>
          file.kind === "overlay" &&
          file.provenance.tier === "workflow-overlay" &&
          !isSpecKitWorkflowOverlayDisabled(file.content),
      )
      .map((file) => [file, parseSpecKitWorkflowOverlay(file.content)]),
  );

const assertContiguousOrders = (files: readonly GroupedFile[], scope: string): void => {
  const orders = files.map(({ file }) => file.provenance.order);
  if (new Set(orders).size !== orders.length || orders.some((order) => order >= orders.length)) {
    throw new TypeError(
      `Spec Kit native provenance orders for ${scope} must be unique and contiguous.`,
    );
  }
};

const assertOverlayProvenance = (
  results: ReadonlyMap<SpecKitFile, SpecKitWorkflowOverlayParseResult>,
): void => {
  results.forEach((result, file) => {
    const overlay = result.program;
    if (overlay === undefined) return;
    const expectedProviderId = `project:${overlay.overlayId}`;
    const expectedScope = `workflow:${overlay.extendsWorkflowId}`;
    if (
      file.provenance.providerId !== expectedProviderId ||
      file.provenance.resolutionScope !== expectedScope ||
      file.provenance.priority !== overlay.priority ||
      file.provenance.strategy !== undefined
    ) {
      throw new TypeError(
        `Spec Kit workflow overlay provenance for ${file.path} must match native identity, target, and normalized priority.`,
      );
    }
  });
};

const assertUniqueEnabledOverlayIds = (
  enabledOverlays: readonly GroupedFile[],
  results: ReadonlyMap<SpecKitFile, SpecKitWorkflowOverlayParseResult>,
  scope: string,
): void => {
  const overlayIds = new Set<string>();
  const providerIds = new Set<string>();
  enabledOverlays.forEach(({ file }) => {
    const overlayId = results.get(file)!.program!.overlayId;
    if (overlayIds.has(overlayId) || providerIds.has(file.provenance.providerId)) {
      throw new TypeError(`Duplicate overlay id '${overlayId}' in workflow scope ${scope}.`);
    }
    overlayIds.add(overlayId);
    providerIds.add(file.provenance.providerId);
  });
};

const assertWorkflowResolutionOrder = (
  files: readonly GroupedFile[],
  results: ReadonlyMap<SpecKitFile, SpecKitWorkflowOverlayParseResult>,
): void => {
  const scopes = new Map<string, GroupedFile[]>();
  files.forEach((grouped) => {
    if (!grouped.file.provenance.resolutionScope.startsWith("workflow:")) return;
    const scoped = scopes.get(grouped.file.provenance.resolutionScope) ?? [];
    scoped.push(grouped);
    scopes.set(grouped.file.provenance.resolutionScope, scoped);
  });
  scopes.forEach((scopedFiles, scope) => {
    const enabledOverlays = scopedFiles.filter(
      ({ file }) => results.get(file)?.program?.enabled === true,
    );
    assertUniqueEnabledOverlayIds(enabledOverlays, results, scope);
    const baseFiles = scopedFiles.filter(({ file }) => file.kind === "workflow");
    const participatingFiles = [...enabledOverlays, ...baseFiles];
    assertContiguousOrders(participatingFiles, scope);
    const byDeclaredOrder = enabledOverlays
      .toSorted((left, right) => left.file.provenance.order - right.file.provenance.order)
      .map(({ file }) => file.provenance.providerId);
    const byNativePrecedence = enabledOverlays
      .toSorted(
        (left, right) =>
          left.file.provenance.priority! - right.file.provenance.priority! ||
          (left.file.provenance.providerId < right.file.provenance.providerId
            ? -1
            : left.file.provenance.providerId > right.file.provenance.providerId
              ? 1
              : 0),
      )
      .map(({ file }) => file.provenance.providerId);
    if (byDeclaredOrder.some((providerId, index) => providerId !== byNativePrecedence[index])) {
      throw new TypeError(
        `Spec Kit workflow resolution order for ${scope} must sort enabled overlays by priority and source ascending.`,
      );
    }
    const baseOrders = baseFiles.map(({ file }) => file.provenance.order);
    if (baseOrders.length > 1) {
      throw new TypeError(`Spec Kit workflow resolution scope ${scope} must contain one base.`);
    }
    const lastEnabledOverlayOrder = Math.max(
      -1,
      ...enabledOverlays.map(({ file }) => file.provenance.order),
    );
    if (baseOrders.some((order) => order <= lastEnabledOverlayOrder)) {
      throw new TypeError(
        `Spec Kit workflow resolution order for ${scope} must place the base workflow after enabled overlays.`,
      );
    }
  });
  const nonWorkflowScopes = new Map<string, GroupedFile[]>();
  files.forEach((grouped) => {
    const scope = grouped.file.provenance.resolutionScope;
    if (scope.startsWith("workflow:")) return;
    const scoped = nonWorkflowScopes.get(scope) ?? [];
    scoped.push(grouped);
    nonWorkflowScopes.set(scope, scoped);
  });
  nonWorkflowScopes.forEach(assertContiguousOrders);
};

const workflowStepIds = (definition: JsonObject): ReadonlySet<string> => {
  const ids = new Set<string>();
  const visit = (nested: unknown): void => {
    if (!Array.isArray(nested)) return;
    nested.forEach((step) => {
      if (!isPortableRecord(step)) return;
      if (typeof step.id === "string") ids.add(step.id);
      ["then", "else", "steps", "default"].forEach((key) => visit(step[key]));
      if (isPortableRecord(step.cases)) Object.values(step.cases).forEach(visit);
    });
  };
  visit(definition.steps);
  return ids;
};

const assertOverlayEditsAgainstBase = (
  files: readonly GroupedFile[],
  workflows: ReadonlyMap<SpecKitFile, SpecKitWorkflowParseResult>,
  overlays: ReadonlyMap<SpecKitFile, SpecKitWorkflowOverlayParseResult>,
): void => {
  const bases = new Map<string, SpecKitWorkflowProgram>();
  files.forEach(({ file }) => {
    const program = workflows.get(file)?.program;
    if (
      file.kind !== "workflow" ||
      program === undefined ||
      !file.provenance.resolutionScope.startsWith("workflow:")
    )
      return;
    const expectedScope = `workflow:${program.workflowId}`;
    if (file.provenance.resolutionScope !== expectedScope) {
      throw new TypeError(
        `Spec Kit base workflow provenance for ${file.path} must match its native workflow ID.`,
      );
    }
    bases.set(expectedScope, program);
  });
  overlays.forEach((result, file) => {
    const overlay = result.program;
    if (overlay === undefined || !overlay.enabled) return;
    const scope = file.provenance.resolutionScope;
    const base = bases.get(scope);
    if (base === undefined) return;
    const baseIds = workflowStepIds(base.definition);
    overlay.edits.forEach((edit, index) => {
      if (!baseIds.has(edit.anchor)) {
        throw new TypeError(
          `Spec Kit workflow overlay edit ${index} in ${file.path} has no matching base step ID.`,
        );
      }
    });
  });
};

const nestedStepLists = (step: JsonObject): readonly JsonObject[][] => {
  const lists = ["then", "else", "steps", "default"].flatMap((key) => {
    const value = step[key];
    return Array.isArray(value) ? [value.filter(isPortableRecord) as JsonObject[]] : [];
  });
  if (isPortableRecord(step.cases)) {
    Object.values(step.cases).forEach((value) => {
      if (Array.isArray(value)) lists.push(value.filter(isPortableRecord) as JsonObject[]);
    });
  }
  return lists;
};

const findWorkflowStep = (steps: readonly JsonObject[], stepId: string): JsonObject | null => {
  for (const step of steps) {
    if (step.id === stepId) return step;
    for (const nested of nestedStepLists(step)) {
      const found = findWorkflowStep(nested, stepId);
      if (found !== null) return found;
    }
  }
  return null;
};

const descendantStepIds = (step: JsonObject): ReadonlySet<string> => {
  const ids = new Set<string>();
  const collect = (steps: readonly JsonObject[]): void => {
    steps.forEach((nestedStep) => {
      if (typeof nestedStep.id === "string") ids.add(nestedStep.id);
      nestedStepLists(nestedStep).forEach(collect);
    });
  };
  nestedStepLists(step).forEach(collect);
  return ids;
};

interface WinningOverlayEdit {
  readonly grouped: GroupedFile;
  readonly operation: SpecKitOverlayOperation;
  readonly index: number;
}

const overlayResolutionIssues = (
  files: readonly GroupedFile[],
  workflows: ReadonlyMap<SpecKitFile, SpecKitWorkflowParseResult>,
  overlays: ReadonlyMap<SpecKitFile, SpecKitWorkflowOverlayParseResult>,
): readonly SpecificationDiagnostic[] => {
  const scopes = new Map<string, GroupedFile[]>();
  files.forEach((grouped) => {
    if (overlays.get(grouped.file)?.program?.enabled !== true) return;
    const scope = grouped.file.provenance.resolutionScope;
    const scoped = scopes.get(scope) ?? [];
    scoped.push(grouped);
    scopes.set(scope, scoped);
  });
  return [...scopes.entries()].flatMap(
    ([scope, enabledOverlays]): readonly SpecificationDiagnostic[] => {
      const base = files.find(
        ({ file }) =>
          file.kind === "workflow" &&
          file.provenance.resolutionScope === scope &&
          workflows.get(file)?.program !== undefined,
      );
      if (base === undefined) {
        return enabledOverlays.map(({ source, file }) => ({
          code: "spec-kit-workflow-overlay-base-unobserved",
          severity: "warning",
          impact: "blocking",
          explanation:
            "The enabled overlay is preserved, but its anchors and native winning-operation conflicts cannot be verified without the observed base workflow tree.",
          source: { sourceId: source.sourceId as never, documentId: file.path },
        }));
      }
      const rawSteps = workflows.get(base.file)?.program?.definition.steps;
      const steps = Array.isArray(rawSteps)
        ? (rawSteps.filter(isPortableRecord) as JsonObject[])
        : [];
      const winners = new Map<string, WinningOverlayEdit>();
      enabledOverlays
        .toSorted((left, right) => {
          const leftProgram = overlays.get(left.file)!.program!;
          const rightProgram = overlays.get(right.file)!.program!;
          return (
            rightProgram.priority - leftProgram.priority ||
            (leftProgram.overlayId < rightProgram.overlayId
              ? -1
              : leftProgram.overlayId > rightProgram.overlayId
                ? 1
                : 0)
          );
        })
        .forEach((grouped) => {
          overlays.get(grouped.file)!.program!.edits.forEach((edit, index) => {
            winners.set(edit.anchor, { grouped, operation: edit.operation, index });
          });
        });
      return [...winners.entries()]
        .toSorted(([leftAnchor], [rightAnchor]) =>
          leftAnchor < rightAnchor ? -1 : leftAnchor > rightAnchor ? 1 : 0,
        )
        .flatMap(([anchor, winner]) => {
          if (winner.operation !== "replace" && winner.operation !== "remove") return [];
          const step = findWorkflowStep(steps, anchor);
          if (step === null) return [];
          const descendants = descendantStepIds(step);
          return [...winners.keys()]
            .filter((candidate) => descendants.has(candidate))
            .sort(compareUtf16CodeUnits)
            .map((descendant) => ({
              code: "spec-kit-workflow-overlay-anchor-conflict",
              severity: "error",
              impact: "blocking",
              explanation: `Overlay anchor conflict: '${anchor}' is an ancestor of '${descendant}', and the ancestor's winning ${winner.operation} operation makes the result order-dependent.`,
              source: {
                sourceId: winner.grouped.source.sourceId as never,
                documentId: winner.grouped.file.path,
                location: `/edits/${winner.index}`,
              },
            }));
        });
    },
  );
};

/**
 * Import source-owned Spec Kit artifacts and workflow programs.
 *
 * This observes no CLI, restores no run, and grants no execution authority.
 */
export const importSpecKitFiles = (rawInput: SpecKitFileImportInput): SpecKitFileImportResult => {
  const input = capturePortable(rawInput, "Spec Kit file input");
  assertInput(input);
  const files = groupedFiles(input);
  const parsedWorkflows = workflowResults(files);
  const parsedOverlays = overlayResults(files);
  assertOverlayProvenance(parsedOverlays);
  assertWorkflowResolutionOrder(files, parsedOverlays);
  assertOverlayEditsAgainstBase(files, parsedWorkflows, parsedOverlays);
  const diagnostics: SpecificationDiagnostic[] = files.flatMap(({ source, file }) => {
    const sourceId = source.sourceId as never;
    if (file.kind === "workflow-state") {
      return [
        {
          code: "spec-kit-workflow-state-not-durable-checkpoint",
          severity: "warning",
          impact: "advisory",
          explanation:
            "Local Spec Kit workflow state remains source-owned observation data; it is not an llm-core durable execution checkpoint.",
          source: { sourceId, documentId: file.path },
        } satisfies SpecificationDiagnostic,
      ];
    }
    if (file.kind === "other") {
      return [
        {
          code: "spec-kit-unclassified-file-preserved",
          severity: "info",
          impact: "advisory",
          explanation: "The unclassified Spec Kit file remains a source-owned artifact.",
          source: { sourceId, documentId: file.path },
        } satisfies SpecificationDiagnostic,
      ];
    }
    return [
      ...(parsedWorkflows.get(file)?.issues ?? []),
      ...(parsedOverlays.get(file)?.issues ?? []),
    ].map((issue) => issueForFile(source.sourceId, file, issue));
  });
  diagnostics.push(...overlayResolutionIssues(files, parsedWorkflows, parsedOverlays));
  const blocking = diagnostics.find((diagnostic) => diagnostic.impact === "blocking");
  if (blocking !== undefined) {
    throw new TypeError(`Spec Kit portable derivation is unsupported: ${blocking.explanation}`);
  }
  const sources = input.sources.map((source) =>
    createSpecificationSourceSnapshot({
      sourceId: source.sourceId as never,
      format: SPEC_KIT_FILE_FORMAT,
      revision: source.revision,
      contentDigest: sha256(
        JSON.stringify(
          source.files.map((file) => ({
            path: file.path,
            content: file.content,
            kind: file.kind,
            provenance: file.provenance,
          })),
        ),
      ),
      observedAt: input.observedAt,
      role: source.role,
      authority: source.authority,
      documents: source.files.map((file) => ({
        documentId: file.path,
        content: { path: file.path, text: file.content, kind: file.kind },
      })),
      extensions: {
        "io.github.spec-kit": {
          assessedCommit: SPEC_KIT_ASSESSED_COMMIT,
          resolutionOrder: source.files.map((file) => ({
            path: file.path,
            ...file.provenance,
          })),
        },
      },
    }),
  );
  const nodes = files.map(({ source, file }) => {
    const workflowProgram = parsedWorkflows.get(file)?.program;
    const overlayProgram = parsedOverlays.get(file)?.program;
    return {
      nodeId: `spec-kit.node.${createHash("sha256")
        .update(JSON.stringify([source.sourceId, file.path]))
        .digest("hex")}`,
      kind: nodeKindFor(file.kind),
      title: titleFor(file),
      source: { sourceId: source.sourceId as never, documentId: file.path },
      content: { path: file.path, text: file.content, kind: file.kind },
      extensions: {
        "io.github.spec-kit": {
          provenance: file.provenance,
          ...(workflowProgram === undefined ? {} : { workflowProgram }),
          ...(overlayProgram === undefined ? {} : { overlayProgram }),
        },
      },
    };
  });
  const graph: JsonObject = {
    graphId: `spec-kit.graph.${createHash("sha256")
      .update(JSON.stringify(input.sources.map((source) => [source.sourceId, source.revision])))
      .digest("hex")}`,
    version: SPEC_KIT_ASSESSED_VERSION,
    sources: sources as unknown as JsonValue[],
    nodes: nodes as unknown as JsonValue[],
    relationships: [],
  };
  return capturePortable(
    {
      graph,
      operation: createSpecificationOperation({
        operation: "derive-portable-specification",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "supported",
        fixtures: [
          { fixtureId: "spec-kit.workflow.core.c0fe0e4", digest: CORE_WORKFLOW_FIXTURE_DIGEST },
          {
            fixtureId: "spec-kit.workflow.control-flow.c0fe0e4",
            digest: CONTROL_WORKFLOW_FIXTURE_DIGEST,
          },
          {
            fixtureId: "spec-kit.workflow.overlay.installed.c0fe0e4",
            digest: WORKFLOW_OVERLAY_FIXTURE_DIGEST,
          },
        ],
        diagnostics,
      }),
      support: [SPEC_KIT_FILE_SUPPORT, SPEC_KIT_CLI_SUPPORT] as const,
    },
    "Spec Kit file import result",
  );
};
