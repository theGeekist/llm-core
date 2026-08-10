/* eslint-disable sonarjs/cognitive-complexity -- mirrors Spec Kit's recursive step registry schema */
import type { JsonObject, JsonValue } from "#contracts";
import { isPortableRecord } from "#shared/portable-data";
import { capturePortable } from "./portable";
import { validateInputs, validateRequires } from "./workflow-validation";
import { parseSpecKitWorkflowYaml } from "./yaml";

export type SpecKitBuiltInStepType =
  | "command"
  | "prompt"
  | "shell"
  | "init"
  | "gate"
  | "if"
  | "switch"
  | "while"
  | "do-while"
  | "fan-out"
  | "fan-in";

export interface SpecKitWorkflowStep {
  readonly stepId: string;
  readonly type: string;
  /** The complete native step mapping, including expressions and extension keys. */
  readonly definition: JsonObject;
  readonly then?: readonly SpecKitWorkflowStep[];
  readonly else?: readonly SpecKitWorkflowStep[];
  readonly cases?: Readonly<Record<string, readonly SpecKitWorkflowStep[]>>;
  readonly default?: readonly SpecKitWorkflowStep[];
  readonly loop?: {
    readonly condition: JsonValue;
    readonly maxIterations: number;
    readonly steps: readonly SpecKitWorkflowStep[];
  };
  readonly gate?: {
    readonly message: JsonValue;
    readonly options: readonly string[];
    readonly onReject: "abort" | "retry" | "skip";
    readonly showFile?: JsonValue;
  };
  readonly fanOut?: {
    readonly items: JsonValue;
    readonly maxConcurrency: number;
    readonly step: SpecKitWorkflowStep;
  };
  readonly fanIn?: {
    readonly waitFor: readonly string[];
    readonly output: JsonObject;
  };
}

export interface SpecKitWorkflowProgram {
  readonly schemaVersion: "1.0";
  readonly workflowId: string;
  readonly name: string;
  readonly version: string;
  readonly definition: JsonObject;
  readonly steps: readonly SpecKitWorkflowStep[];
}

export interface SpecKitWorkflowParseIssue {
  readonly code: string;
  readonly impact: "advisory" | "blocking";
  readonly explanation: string;
  readonly location?: string;
}

export interface SpecKitWorkflowParseResult {
  readonly program?: SpecKitWorkflowProgram;
  readonly issues: readonly SpecKitWorkflowParseIssue[];
}

const builtIns = new Set<SpecKitBuiltInStepType>([
  "command",
  "prompt",
  "shell",
  "init",
  "gate",
  "if",
  "switch",
  "while",
  "do-while",
  "fan-out",
  "fan-in",
]);

const record = (value: unknown): value is JsonObject => isPortableRecord(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;
const nullableText = (value: unknown): boolean => value === null || typeof value === "string";

const rejected = (
  issues: SpecKitWorkflowParseIssue[],
  explanation: string,
  location?: string,
): void => {
  issues.push({
    code: "spec-kit-workflow-schema-invalid",
    impact: "blocking",
    explanation,
    ...(location === undefined ? {} : { location }),
  });
};

interface StepContext {
  readonly issues: SpecKitWorkflowParseIssue[];
  readonly seen: Set<string>;
}

const stepList = (
  value: unknown,
  location: string,
  context: StepContext,
): readonly SpecKitWorkflowStep[] => {
  if (!Array.isArray(value)) {
    rejected(context.issues, "Nested workflow steps must be a list.", location);
    return [];
  }
  return value.flatMap((step, index) => {
    const parsed = parseStep(step, `${location}/${index}`, context);
    return parsed === null ? [] : [parsed];
  });
};

const parseStep = (
  value: unknown,
  location: string,
  context: StepContext,
): SpecKitWorkflowStep | null => {
  if (!record(value)) {
    rejected(context.issues, "Every workflow step must be a mapping.", location);
    return null;
  }
  const stepId = value.id;
  if (!text(stepId) || stepId.includes(":")) {
    rejected(
      context.issues,
      "Workflow step IDs must be non-blank strings without ':'.",
      `${location}/id`,
    );
    return null;
  }
  if (context.seen.has(stepId)) {
    rejected(context.issues, `Duplicate workflow step ID '${stepId}'.`, `${location}/id`);
  }
  context.seen.add(stepId);
  const rawType = value.type ?? "command";
  if (!text(rawType)) {
    rejected(context.issues, "Workflow step type must be a non-blank string.", `${location}/type`);
    return null;
  }
  if (value.continue_on_error !== undefined && typeof value.continue_on_error !== "boolean") {
    rejected(
      context.issues,
      "continue_on_error must be a boolean.",
      `${location}/continue_on_error`,
    );
  }
  if (!builtIns.has(rawType as SpecKitBuiltInStepType)) {
    context.issues.push({
      code: "spec-kit-workflow-custom-step-uninterpreted",
      impact: "advisory",
      explanation: `Custom step type '${rawType}' is retained in native data but its extension-defined control semantics are not interpreted.`,
      location,
    });
    return { stepId, type: rawType, definition: value };
  }

  const type = rawType as SpecKitBuiltInStepType;
  const base = { stepId, type, definition: value };
  if (type === "command") {
    if (typeof value.command !== "string") {
      rejected(context.issues, "Command steps require a string command.", `${location}/command`);
    }
    if (value.input !== undefined && !record(value.input)) {
      rejected(context.issues, "Command step input must be a mapping.", `${location}/input`);
    }
    if (value.options !== undefined && !record(value.options)) {
      rejected(context.issues, "Command step options must be a mapping.", `${location}/options`);
    }
    if (value.integration !== undefined && !nullableText(value.integration)) {
      rejected(
        context.issues,
        "Command step integration must be text or null.",
        `${location}/integration`,
      );
    }
    if (value.model !== undefined && !nullableText(value.model)) {
      rejected(context.issues, "Command step model must be text or null.", `${location}/model`);
    }
  }
  if (type === "prompt") {
    if (typeof value.prompt !== "string") {
      rejected(context.issues, "Prompt steps require a string prompt.", `${location}/prompt`);
    }
    if (value.integration !== undefined && !nullableText(value.integration)) {
      rejected(
        context.issues,
        "Prompt step integration must be text or null.",
        `${location}/integration`,
      );
    }
    if (value.model !== undefined && !nullableText(value.model)) {
      rejected(context.issues, "Prompt step model must be text or null.", `${location}/model`);
    }
  }
  if (type === "shell") {
    if (typeof value.run !== "string") {
      rejected(context.issues, "Shell steps require a string run command.", `${location}/run`);
    }
    if (
      value.output_format !== undefined &&
      value.output_format !== null &&
      value.output_format !== "json"
    ) {
      rejected(
        context.issues,
        "Shell step output_format must be json when present.",
        `${location}/output_format`,
      );
    }
    if (
      value.timeout !== undefined &&
      (typeof value.timeout !== "number" || !Number.isFinite(value.timeout) || value.timeout <= 0)
    ) {
      rejected(
        context.issues,
        "Shell step timeout must be a positive finite number.",
        `${location}/timeout`,
      );
    }
  }
  if (
    type === "init" &&
    value.script !== undefined &&
    value.script !== null &&
    (typeof value.script !== "string" ||
      (!value.script.includes("{{") && !["sh", "ps", "py"].includes(value.script)))
  ) {
    rejected(
      context.issues,
      "Init step script must be sh, ps, py, an expression, or null.",
      `${location}/script`,
    );
  }
  if (type === "gate") {
    const options = value.options ?? ["approve", "reject"];
    const onReject = value.on_reject ?? "abort";
    if (
      value.message === undefined ||
      !Array.isArray(options) ||
      options.length === 0 ||
      !options.every((option) => typeof option === "string") ||
      !["abort", "retry", "skip"].includes(String(onReject)) ||
      (["abort", "retry"].includes(String(onReject)) &&
        Array.isArray(options) &&
        options.every(
          (option) =>
            typeof option !== "string" || !["reject", "abort"].includes(option.toLowerCase()),
        ))
    ) {
      rejected(
        context.issues,
        "Gate message, options, and on_reject must match schema v1.0, including a reject choice for abort/retry.",
        location,
      );
    }
    return {
      ...base,
      gate: {
        message: value.message ?? "Review required.",
        options: Array.isArray(options)
          ? options.filter((option): option is string => typeof option === "string")
          : [],
        onReject: (["abort", "retry", "skip"].includes(String(onReject)) ? onReject : "abort") as
          | "abort"
          | "retry"
          | "skip",
        ...(value.show_file === undefined ? {} : { showFile: value.show_file }),
      },
    };
  }
  if (type === "if") {
    if (
      value.condition === undefined ||
      !Array.isArray(value.then) ||
      (value.else !== undefined && value.else !== null && !Array.isArray(value.else))
    ) {
      rejected(context.issues, "If steps require condition and then fields.", location);
    }
    return {
      ...base,
      then: stepList(value.then ?? [], `${location}/then`, context),
      else: stepList(value.else ?? [], `${location}/else`, context),
    };
  }
  if (type === "switch") {
    if (
      value.expression === undefined ||
      (value.cases !== undefined && !record(value.cases)) ||
      (value.default !== undefined && value.default !== null && !Array.isArray(value.default))
    ) {
      rejected(context.issues, "Switch steps require expression and cases mappings.", location);
    }
    const cases: Record<string, readonly SpecKitWorkflowStep[]> = {};
    if (record(value.cases)) {
      Object.entries(value.cases).forEach(([name, steps]) => {
        cases[name] = stepList(steps, `${location}/cases/${name}`, context);
      });
    }
    return {
      ...base,
      cases,
      default: stepList(value.default ?? [], `${location}/default`, context),
    };
  }
  if (type === "while" || type === "do-while") {
    const maxIterations = value.max_iterations ?? 10;
    if (
      value.condition === undefined ||
      !positiveInteger(maxIterations) ||
      !Array.isArray(value.steps ?? [])
    ) {
      rejected(
        context.issues,
        `${type} steps require a condition, a list body, and a positive integer bound.`,
        location,
      );
    }
    return {
      ...base,
      loop: {
        condition: value.condition ?? false,
        maxIterations: positiveInteger(maxIterations) ? maxIterations : 10,
        steps: stepList(value.steps ?? [], `${location}/steps`, context),
      },
    };
  }
  if (type === "fan-out") {
    const maxConcurrency = value.max_concurrency ?? 1;
    const templateContext: StepContext = { issues: context.issues, seen: new Set() };
    const template = parseStep(value.step, `${location}/step`, templateContext);
    if (
      value.items === undefined ||
      value.step === undefined ||
      !record(value.step) ||
      !positiveInteger(maxConcurrency) ||
      template === null
    ) {
      rejected(
        context.issues,
        "Fan-out steps require items, a positive concurrency bound, and a step template.",
        location,
      );
    }
    return {
      ...base,
      ...(template === null
        ? {}
        : {
            fanOut: {
              items: value.items ?? [],
              maxConcurrency: positiveInteger(maxConcurrency) ? maxConcurrency : 1,
              step: template,
            },
          }),
    };
  }
  if (type === "fan-in") {
    const waitFor = value.wait_for;
    const output = value.output ?? {};
    if (
      !Array.isArray(waitFor) ||
      waitFor.length === 0 ||
      !waitFor.every(text) ||
      waitFor.some(
        (step) => typeof step === "string" && (step === stepId || !context.seen.has(step)),
      ) ||
      !record(output)
    ) {
      rejected(
        context.issues,
        "Fan-in steps require wait_for step IDs and an optional output mapping.",
        location,
      );
    }
    return {
      ...base,
      fanIn: {
        waitFor: Array.isArray(waitFor) ? waitFor.filter(text) : [],
        output: record(output) ? output : {},
      },
    };
  }
  return base;
};

/** Parse and validate one pinned Spec Kit workflow schema-v1.0 YAML file. */
export const parseSpecKitWorkflow = (content: string): SpecKitWorkflowParseResult => {
  let definition: JsonObject;
  try {
    definition = parseSpecKitWorkflowYaml(content);
  } catch (error) {
    return capturePortable(
      {
        issues: [
          {
            code: "spec-kit-workflow-yaml-unsupported",
            impact: "blocking" as const,
            explanation:
              error instanceof Error ? error.message : "Workflow YAML could not be parsed.",
          },
        ],
      },
      "Spec Kit workflow parse result",
    );
  }

  const issues: SpecKitWorkflowParseIssue[] = [];
  const schemaVersion = definition.schema_version;
  const workflow = definition.workflow;
  if (schemaVersion !== "1.0") {
    rejected(issues, "Only Spec Kit workflow schema_version 1.0 is qualified.", "/schema_version");
  }
  if (!record(workflow)) {
    rejected(issues, "Workflow metadata must be a mapping.", "/workflow");
  }
  const workflowId = record(workflow) ? workflow.id : undefined;
  const name = record(workflow) ? workflow.name : undefined;
  const version = record(workflow) ? workflow.version : undefined;
  if (!text(workflowId) || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(workflowId)) {
    rejected(issues, "Workflow ID must be a lowercase alphanumeric slug.", "/workflow/id");
  }
  if (!text(name)) rejected(issues, "Workflow name must be non-blank text.", "/workflow/name");
  if (!text(version) || !/^\d+\.\d+\.\d+$/.test(version)) {
    rejected(
      issues,
      "Workflow version must be quoted X.Y.Z semantic version text.",
      "/workflow/version",
    );
  }
  validateInputs(definition.inputs, issues);
  validateRequires(definition.requires, issues);
  const context: StepContext = { issues, seen: new Set() };
  const steps = stepList(definition.steps, "/steps", context);
  if (steps.length === 0)
    rejected(issues, "Workflow must contain at least one valid step.", "/steps");

  if (issues.some((issue) => issue.impact === "blocking")) {
    return capturePortable({ issues }, "Spec Kit workflow parse result");
  }
  issues.push({
    code: "spec-kit-workflow-control-preserved",
    impact: "advisory",
    explanation:
      "The complete schema-v1.0 definition, nested branches, loop bounds, gates, fan-out, and fan-in remain source-owned portable data; they are not flattened into dependency edges.",
  });
  return capturePortable(
    {
      program: {
        schemaVersion: "1.0" as const,
        workflowId: workflowId as string,
        name: name as string,
        version: version as string,
        definition,
        steps,
      },
      issues,
    },
    "Spec Kit workflow parse result",
  );
};
