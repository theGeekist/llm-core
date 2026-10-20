import {
  workflowOverlayProvider,
  workflowResolutionScope,
  isWorkflowResolutionScope,
  overlayEditLocation,
} from "./file-identity";
import type { JsonObject } from "#contracts";
import { compareUtf16CodeUnits } from "#shared/fp";
import { isPortableRecord } from "#shared/portable-data";
import type { SpecificationDiagnostic } from "@geekist/llm-core/specifications";
import type { SpecKitFile, GroupedFile } from "./file-types";
import type { SpecKitOverlayOperation, SpecKitWorkflowOverlayParseResult } from "./overlay";
import type { SpecKitWorkflowParseResult, SpecKitWorkflowProgram } from "./workflow";

const overlayResolutionDiagnostics = {
  baseUnobserved: {
    code: "spec-kit-workflow-overlay-base-unobserved",
    severity: "warning",
    impact: "blocking",
    explanation:
      "The enabled overlay is preserved, but its anchors and native winning-operation conflicts cannot be verified without the observed base workflow tree.",
  },
  anchorConflict: {
    code: "spec-kit-workflow-overlay-anchor-conflict",
    severity: "error",
    impact: "blocking",
    explanation: (anchor: string, descendant: string, operation: SpecKitOverlayOperation): string =>
      `Overlay anchor conflict: '${anchor}' is an ancestor of '${descendant}', and the ancestor's winning ${operation} operation makes the result order-dependent.`,
  },
} as const;

const assertContiguousOrders = (files: readonly GroupedFile[], scope: string): void => {
  const orders = files.map(({ file }) => file.provenance.order);
  if (new Set(orders).size !== orders.length || orders.some((order) => order >= orders.length)) {
    throw new TypeError(
      `Spec Kit native provenance orders for ${scope} must be unique and contiguous.`,
    );
  }
};

export const assertOverlayProvenance = (
  results: ReadonlyMap<SpecKitFile, SpecKitWorkflowOverlayParseResult>,
): void => {
  results.forEach((result, file) => {
    const overlay = result.program;
    if (overlay === undefined) return;
    const expectedProviderId = workflowOverlayProvider(overlay.overlayId);
    const expectedScope = workflowResolutionScope(overlay.extendsWorkflowId);
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

export const assertWorkflowResolutionOrder = (
  files: readonly GroupedFile[],
  results: ReadonlyMap<SpecKitFile, SpecKitWorkflowOverlayParseResult>,
): void => {
  const scopes = new Map<string, GroupedFile[]>();
  files.forEach((grouped) => {
    if (!isWorkflowResolutionScope(grouped.file.provenance.resolutionScope)) return;
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
          compareUtf16CodeUnits(left.file.provenance.providerId, right.file.provenance.providerId),
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
    if (isWorkflowResolutionScope(scope)) return;
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

export const assertOverlayEditsAgainstBase = (
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
      !isWorkflowResolutionScope(file.provenance.resolutionScope)
    )
      return;
    const expectedScope = workflowResolutionScope(program.workflowId);
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

export const overlayResolutionIssues = (
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
          ...overlayResolutionDiagnostics.baseUnobserved,
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
              ...overlayResolutionDiagnostics.anchorConflict,
              explanation: overlayResolutionDiagnostics.anchorConflict.explanation(
                anchor,
                descendant,
                winner.operation,
              ),
              source: {
                sourceId: winner.grouped.source.sourceId as never,
                documentId: winner.grouped.file.path,
                location: overlayEditLocation(winner.index),
              },
            }));
        });
    },
  );
};
