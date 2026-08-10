/* eslint-disable sonarjs/cognitive-complexity -- mirrors the pinned native overlay validator */
import type { JsonObject } from "#contracts";
import { isPortableRecord } from "#shared/portable-data";
import { capturePortable } from "./portable";
import { parseSpecKitWorkflowYaml } from "./yaml";

export type SpecKitOverlayOperation = "insert_after" | "insert_before" | "replace" | "remove";

export interface SpecKitWorkflowOverlayEdit {
  readonly operation: SpecKitOverlayOperation;
  readonly anchor: string;
  readonly step?: JsonObject;
}

export interface SpecKitWorkflowOverlayProgram {
  readonly overlayId: string;
  readonly extendsWorkflowId: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly definition: JsonObject;
  readonly edits: readonly SpecKitWorkflowOverlayEdit[];
}

export interface SpecKitWorkflowOverlayParseIssue {
  readonly code: "spec-kit-workflow-overlay-schema-invalid" | "spec-kit-workflow-overlay-preserved";
  readonly impact: "advisory" | "blocking";
  readonly explanation: string;
  readonly location?: string;
}

export interface SpecKitWorkflowOverlayParseResult {
  readonly program?: SpecKitWorkflowOverlayProgram;
  readonly issues: readonly SpecKitWorkflowOverlayParseIssue[];
}

const operations = new Set<SpecKitOverlayOperation>([
  "insert_after",
  "insert_before",
  "replace",
  "remove",
]);
const reservedWorkflowIds = new Set(["overlays", "runs", "steps"]);
const safeId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
const record = (value: unknown): value is JsonObject => isPortableRecord(value);

const reject = (
  issues: SpecKitWorkflowOverlayParseIssue[],
  explanation: string,
  location?: string,
): void => {
  issues.push({
    code: "spec-kit-workflow-overlay-schema-invalid",
    impact: "blocking",
    explanation,
    ...(location === undefined ? {} : { location }),
  });
};

const normalizedPriority = (value: unknown): number => {
  if (typeof value === "boolean" || value === null || value === undefined) return 10;
  const parsed =
    typeof value === "number"
      ? Math.trunc(value)
      : typeof value === "string" && /^[+-]?\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 10;
};

/** Native installed-overlay collection skips schema validation when `enabled: false`. */
export const isSpecKitWorkflowOverlayDisabled = (content: string): boolean => {
  try {
    return parseSpecKitWorkflowYaml(content).enabled === false;
  } catch {
    return false;
  }
};

const parseEdit = (
  value: unknown,
  index: number,
  issues: SpecKitWorkflowOverlayParseIssue[],
): SpecKitWorkflowOverlayEdit | null => {
  const location = `/edits/${index}`;
  if (!record(value)) {
    reject(issues, "Every overlay edit must be a mapping.", location);
    return null;
  }
  const shorthand = [...operations].filter((operation) => Object.hasOwn(value, operation));
  const hasExplicit = Object.hasOwn(value, "operation");
  if ((shorthand.length > 0 && hasExplicit) || shorthand.length > 1) {
    reject(issues, "An overlay edit must declare exactly one operation form.", location);
    return null;
  }
  const operation = (hasExplicit ? value.operation : shorthand[0]) as unknown;
  const anchor = hasExplicit
    ? value.anchor
    : typeof operation === "string"
      ? value[operation]
      : null;
  if (typeof operation !== "string" || !operations.has(operation as SpecKitOverlayOperation)) {
    reject(issues, "Overlay edit operation is missing or unsupported.", `${location}/operation`);
    return null;
  }
  if (typeof anchor !== "string" || anchor.length === 0) {
    reject(issues, "Overlay edit anchor must be non-empty text.", `${location}/anchor`);
    return null;
  }
  const typedOperation = operation as SpecKitOverlayOperation;
  if (typedOperation === "remove") {
    if (value.step !== undefined && value.step !== null) {
      reject(issues, "Remove edits must not include a step.", `${location}/step`);
      return null;
    }
    return { operation: typedOperation, anchor };
  }
  if (!record(value.step)) {
    reject(issues, `${typedOperation} edits require a step mapping.`, `${location}/step`);
    return null;
  }
  if (
    typeof value.step.id !== "string" ||
    value.step.id.length === 0 ||
    value.step.id.includes(":")
  ) {
    reject(issues, "Overlay edit steps require a non-empty ID without ':'.", `${location}/step/id`);
    return null;
  }
  return { operation: typedOperation, anchor, step: value.step };
};

/** Parse and validate one native Spec Kit workflow overlay manifest. */
export const parseSpecKitWorkflowOverlay = (content: string): SpecKitWorkflowOverlayParseResult => {
  let definition: JsonObject;
  try {
    definition = parseSpecKitWorkflowYaml(content);
  } catch (error) {
    return capturePortable(
      {
        issues: [
          {
            code: "spec-kit-workflow-overlay-schema-invalid" as const,
            impact: "blocking" as const,
            explanation:
              error instanceof Error ? error.message : "Overlay YAML could not be parsed.",
          },
        ],
      },
      "Spec Kit workflow overlay parse result",
    );
  }

  const issues: SpecKitWorkflowOverlayParseIssue[] = [];
  if (!safeId(definition.id) || definition.id === "overlays") {
    reject(issues, "Overlay ID must be a safe, non-reserved lowercase slug.", "/id");
  }
  if (!safeId(definition.extends) || reservedWorkflowIds.has(String(definition.extends))) {
    reject(issues, "Overlay target must be a safe, non-reserved workflow ID.", "/extends");
  }
  if (definition.enabled !== undefined && typeof definition.enabled !== "boolean") {
    reject(issues, "Overlay enabled must be a boolean.", "/enabled");
  }
  if (!Array.isArray(definition.edits) || definition.edits.length === 0) {
    reject(issues, "Overlay edits must be a non-empty list.", "/edits");
  }
  const edits = Array.isArray(definition.edits)
    ? definition.edits.flatMap((edit, index) => {
        const parsed = parseEdit(edit, index, issues);
        return parsed === null ? [] : [parsed];
      })
    : [];
  if (issues.some((issue) => issue.impact === "blocking")) {
    return capturePortable({ issues }, "Spec Kit workflow overlay parse result");
  }
  issues.push({
    code: "spec-kit-workflow-overlay-preserved",
    impact: "advisory",
    explanation:
      "The native overlay identity, target, priority, enabled state, and ordered edits remain source-owned portable data.",
  });
  return capturePortable(
    {
      program: {
        overlayId: definition.id as string,
        extendsWorkflowId: definition.extends as string,
        priority: normalizedPriority(definition.priority),
        enabled: definition.enabled === undefined ? true : (definition.enabled as boolean),
        definition,
        edits,
      },
      issues,
    },
    "Spec Kit workflow overlay parse result",
  );
};
