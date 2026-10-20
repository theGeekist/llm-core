import { specKitFileIdentity, specKitGraphIdentity } from "./file-identity";
import {
  specKitDocumentKinds,
  isSpecKitDocumentKind,
  isSpecKitProvenanceTier,
  isSpecKitResolutionStrategy,
} from "./file-types";
import {
  specKitContract,
  SPEC_KIT_ASSESSED_VERSION,
  SPEC_KIT_ASSESSED_COMMIT,
  SPEC_KIT_FILE_FORMAT,
  SPEC_KIT_FILE_SUPPORT,
  SPEC_KIT_CLI_SUPPORT,
} from "./support";
export {
  SPEC_KIT_ASSESSED_VERSION,
  SPEC_KIT_ASSESSED_COMMIT,
  SPEC_KIT_FILE_FORMAT,
  SPEC_KIT_CLI_FORMAT,
  SPEC_KIT_FILE_SUPPORT,
  SPEC_KIT_CLI_SUPPORT,
} from "./support";
import type {
  SpecKitDocumentKind,
  SpecKitFile,
  SpecKitFileImportInput,
  SpecKitFileImportResult,
  GroupedFile,
} from "./file-types";
export type {
  SpecKitDocumentKind,
  SpecKitProvenanceTier,
  SpecKitFileProvenance,
  SpecKitFile,
  SpecKitFileImportInput,
  SpecKitFileSource,
  SpecKitFileImportResult,
} from "./file-types";
import {
  assertOverlayProvenance,
  assertWorkflowResolutionOrder,
  assertOverlayEditsAgainstBase,
  overlayResolutionIssues,
} from "./file-resolution";
import { createHash } from "node:crypto";
import { digest, type JsonObject, type JsonValue } from "#contracts";
import { hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import {
  createSpecificationOperation,
  createSpecificationSourceSnapshot,
  type SpecificationDiagnostic,
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

const sha256 = (value: string) => digest(createHash("sha256").update(value).digest("hex"));

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
        !isSpecKitDocumentKind(file.kind) ||
        !exact(
          file.provenance,
          ["tier", "providerId", "resolutionScope", "order"],
          ["priority", "strategy"],
        ) ||
        !isSpecKitProvenanceTier(file.provenance.tier) ||
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
          (typeof file.provenance.strategy !== "string" ||
            !isSpecKitResolutionStrategy(file.provenance.strategy)))
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

const groupedFiles = (input: SpecKitFileImportInput): readonly GroupedFile[] =>
  input.sources.flatMap((source) => source.files.map((file) => ({ source, file })));

const nodeKindFor = (kind: SpecKitDocumentKind) => specKitDocumentKinds[kind].nodeKind;

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
          ...specKitContract.observationDiagnostics.workflowState,
          source: { sourceId, documentId: file.path },
        } satisfies SpecificationDiagnostic,
      ];
    }
    if (file.kind === "other") {
      return [
        {
          ...specKitContract.observationDiagnostics.unclassifiedFile,
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
        [specKitContract.namespace]: {
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
      nodeId: specKitFileIdentity(source.sourceId, file.path),
      kind: nodeKindFor(file.kind),
      title: titleFor(file),
      source: { sourceId: source.sourceId as never, documentId: file.path },
      content: { path: file.path, text: file.content, kind: file.kind },
      extensions: {
        [specKitContract.namespace]: {
          provenance: file.provenance,
          ...(workflowProgram === undefined ? {} : { workflowProgram }),
          ...(overlayProgram === undefined ? {} : { overlayProgram }),
        },
      },
    };
  });
  const graph: JsonObject = {
    graphId: specKitGraphIdentity(input.sources),
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
        sourceContract: specKitContract.file,
        disposition: "supported",
        fixtures: [
          specKitContract.fixtures.coreWorkflow,
          specKitContract.fixtures.controlWorkflow,
          specKitContract.fixtures.workflowOverlay,
        ],
        diagnostics,
      }),
      support: [SPEC_KIT_FILE_SUPPORT, SPEC_KIT_CLI_SUPPORT] as const,
    },
    "Spec Kit file import result",
  );
};
