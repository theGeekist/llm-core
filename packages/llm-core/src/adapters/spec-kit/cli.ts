import type { JsonObject } from "#contracts";
import { hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import { capturePortable } from "./portable";

export const SPEC_KIT_ASSESSED_CLI_VERSION = "0.14.3.dev0" as const;

export interface SpecKitCliVersionInput {
  readonly observedAt: string;
  /** Exact stdout bytes from `specify --version`. */
  readonly stdout: string;
}

export interface SpecKitCliVersionObservation extends SpecKitCliVersionInput {
  readonly version: typeof SPEC_KIT_ASSESSED_CLI_VERSION;
}

export interface SpecKitWorkflowStatusInput {
  readonly observedAt: string;
  readonly version: typeof SPEC_KIT_ASSESSED_CLI_VERSION;
  readonly command: "run" | "resume" | "status";
  /** The actual process exit code observed for this command. */
  readonly exitCode: 0 | 1;
  /** Exact stdout bytes from `specify workflow <command> ... --json`. */
  readonly stdout: string;
}

export type SpecKitRunStatus =
  | "created"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "aborted";
export type SpecKitRunCommandStatus = "completed" | "paused" | "failed" | "aborted";
export type SpecKitStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "paused"
  | "unknown";

export type SpecKitRunOutcome = "non-terminal" | "successful" | "failed";

export interface SpecKitGateStatus {
  readonly stepId: string;
  readonly message: string | null;
  readonly options: readonly string[] | null;
  readonly choice: string | null;
}

interface SpecKitRunObservationBase {
  readonly observedAt: string;
  readonly version: typeof SPEC_KIT_ASSESSED_CLI_VERSION;
  readonly raw: JsonObject;
  readonly runId: string;
  readonly workflowId: string;
  readonly status: SpecKitRunStatus;
  readonly currentStepId: string | null;
  readonly currentStepIndex: number;
  readonly gate?: SpecKitGateStatus;
  readonly commandExitCode: 0 | 1;
  readonly runOutcome: SpecKitRunOutcome;
}

export interface SpecKitRunCommandObservation extends SpecKitRunObservationBase {
  readonly kind: "run-outcome";
  readonly command: "run" | "resume";
  readonly status: SpecKitRunCommandStatus;
}

export interface SpecKitSingleRunStatusObservation extends SpecKitRunObservationBase {
  readonly kind: "run-status";
  readonly command: "status";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly steps: Readonly<Record<string, SpecKitStepStatus>>;
}

export interface SpecKitRunListItem {
  readonly runId: string;
  readonly workflowId: string | null;
  readonly status: SpecKitRunStatus;
  readonly updatedAt: string | null;
  readonly runOutcome: SpecKitRunOutcome;
}

export interface SpecKitRunListStatusObservation {
  readonly kind: "list-status";
  readonly command: "status";
  readonly observedAt: string;
  readonly version: typeof SPEC_KIT_ASSESSED_CLI_VERSION;
  readonly raw: JsonObject;
  readonly commandExitCode: 0;
  readonly runs: readonly SpecKitRunListItem[];
}

export type SpecKitWorkflowStatusObservation =
  | SpecKitRunCommandObservation
  | SpecKitSingleRunStatusObservation
  | SpecKitRunListStatusObservation;

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> =>
  isPortableRecord(value) && hasOnlyKeys(value, required, optional);
const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const nativeTimestamp = (value: unknown): value is string =>
  nonBlank(value) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  !Number.isNaN(Date.parse(value));
const runStatuses = new Set<SpecKitRunStatus>([
  "created",
  "running",
  "paused",
  "completed",
  "failed",
  "aborted",
]);
const runCommandStatuses = new Set<SpecKitRunCommandStatus>([
  "completed",
  "paused",
  "failed",
  "aborted",
]);
const stepStatuses = new Set<SpecKitStepStatus>([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "paused",
  "unknown",
]);
const isRunStatus = (value: unknown): value is SpecKitRunStatus =>
  typeof value === "string" && runStatuses.has(value as SpecKitRunStatus);
const isRunCommandStatus = (value: unknown): value is SpecKitRunCommandStatus =>
  typeof value === "string" && runCommandStatuses.has(value as SpecKitRunCommandStatus);
const isStepStatus = (value: unknown): value is SpecKitStepStatus =>
  typeof value === "string" && stepStatuses.has(value as SpecKitStepStatus);

const runOutcome = (status: SpecKitRunStatus): SpecKitRunOutcome =>
  status === "failed" || status === "aborted"
    ? "failed"
    : status === "completed"
      ? "successful"
      : "non-terminal";

const expectedExitCode = (
  command: SpecKitWorkflowStatusInput["command"],
  status?: SpecKitRunStatus,
): 0 | 1 => (command === "status" || (status !== "failed" && status !== "aborted") ? 0 : 1);

const assertVersion: (
  version: string,
) => asserts version is typeof SPEC_KIT_ASSESSED_CLI_VERSION = (version) => {
  if (version !== SPEC_KIT_ASSESSED_CLI_VERSION) {
    throw new TypeError(`Unsupported Spec Kit CLI version: ${version}.`);
  }
};

/** Detect the CLI version from its own command, independently of status JSON. */
export const observeSpecKitCliVersion = (
  rawInput: SpecKitCliVersionInput,
): SpecKitCliVersionObservation => {
  const input = capturePortable(rawInput, "Spec Kit CLI version input");
  if (!nativeTimestamp(input.observedAt)) {
    throw new TypeError("Spec Kit CLI version observations require a canonical timestamp.");
  }
  const match = /^specify ([^\s]+)\s*$/.exec(input.stdout);
  if (match === null) {
    throw new TypeError("Spec Kit CLI version stdout must match `specify <version>`.");
  }
  const version = match[1]!;
  assertVersion(version);
  return capturePortable({ ...input, version }, "Spec Kit CLI version observation");
};

const parseGate = (
  value: unknown,
  status: SpecKitRunStatus,
  currentStepId: string | null,
): SpecKitGateStatus => {
  if (
    !exact(value, ["step_id", "message", "options", "choice"]) ||
    !nonBlank(value.step_id) ||
    (value.message !== null && typeof value.message !== "string") ||
    (value.options !== null &&
      (!Array.isArray(value.options) ||
        !value.options.every((option) => typeof option === "string"))) ||
    (value.choice !== null && typeof value.choice !== "string") ||
    !["paused", "aborted"].includes(status) ||
    value.step_id !== currentStepId
  ) {
    throw new TypeError("Spec Kit workflow gate status does not match the 0.14.3.dev0 JSON shape.");
  }
  return {
    stepId: value.step_id,
    message: value.message,
    options: value.options as readonly string[] | null,
    choice: value.choice,
  };
};

const parseRunStatus = (
  value: Record<string, unknown>,
  input: SpecKitWorkflowStatusInput,
): SpecKitSingleRunStatusObservation => {
  if (
    !exact(
      value,
      [
        "run_id",
        "workflow_id",
        "status",
        "current_step_id",
        "current_step_index",
        "created_at",
        "updated_at",
        "steps",
      ],
      ["gate"],
    ) ||
    !nonBlank(value.run_id) ||
    !nonBlank(value.workflow_id) ||
    !isRunStatus(value.status) ||
    (value.current_step_id !== null && !nonBlank(value.current_step_id)) ||
    typeof value.current_step_index !== "number" ||
    !Number.isInteger(value.current_step_index) ||
    value.current_step_index < 0 ||
    !nativeTimestamp(value.created_at) ||
    !nativeTimestamp(value.updated_at) ||
    !isPortableRecord(value.steps) ||
    !Object.values(value.steps).every(isStepStatus)
  ) {
    throw new TypeError(
      "Spec Kit workflow status stdout does not match the 0.14.3.dev0 run shape.",
    );
  }
  if (input.command !== "status" || input.exitCode !== expectedExitCode(input.command)) {
    throw new TypeError("Spec Kit workflow status payload requires a successful status command.");
  }
  const status = value.status;
  const currentStepId = value.current_step_id;
  if (value.gate === undefined && ["paused", "aborted"].includes(status)) {
    // Interrupt and non-gate abort paths are valid, so gate remains optional.
  }
  const gate = value.gate === undefined ? undefined : parseGate(value.gate, status, currentStepId);
  return {
    kind: "run-status",
    command: "status",
    observedAt: input.observedAt,
    version: input.version,
    raw: value as JsonObject,
    runId: value.run_id,
    workflowId: value.workflow_id,
    status,
    currentStepId,
    currentStepIndex: value.current_step_index,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    steps: value.steps as Readonly<Record<string, SpecKitStepStatus>>,
    ...(gate === undefined ? {} : { gate }),
    commandExitCode: input.exitCode,
    runOutcome: runOutcome(status),
  };
};

const parseRunOutcome = (
  value: Record<string, unknown>,
  input: SpecKitWorkflowStatusInput,
): SpecKitRunCommandObservation => {
  if (
    !exact(
      value,
      ["run_id", "workflow_id", "status", "current_step_id", "current_step_index"],
      ["gate"],
    ) ||
    !nonBlank(value.run_id) ||
    !nonBlank(value.workflow_id) ||
    !isRunCommandStatus(value.status) ||
    (value.current_step_id !== null && !nonBlank(value.current_step_id)) ||
    !Number.isInteger(value.current_step_index) ||
    (value.current_step_index as number) < 0 ||
    input.command === "status" ||
    input.exitCode !== expectedExitCode(input.command, value.status)
  ) {
    throw new TypeError(
      "Spec Kit workflow run/resume stdout or process exit code does not match 0.14.3.dev0.",
    );
  }
  const status = value.status;
  const currentStepId = value.current_step_id;
  const gate = value.gate === undefined ? undefined : parseGate(value.gate, status, currentStepId);
  return {
    kind: "run-outcome",
    command: input.command,
    observedAt: input.observedAt,
    version: input.version,
    raw: value as JsonObject,
    runId: value.run_id,
    workflowId: value.workflow_id,
    status,
    currentStepId,
    currentStepIndex: value.current_step_index as number,
    ...(gate === undefined ? {} : { gate }),
    commandExitCode: input.exitCode,
    runOutcome: runOutcome(status),
  };
};

const parseList = (
  value: Record<string, unknown>,
  input: SpecKitWorkflowStatusInput,
): SpecKitRunListStatusObservation => {
  if (
    !exact(value, ["runs"]) ||
    !Array.isArray(value.runs) ||
    input.command !== "status" ||
    input.exitCode !== 0
  ) {
    throw new TypeError("Spec Kit workflow status stdout must be a run or list payload.");
  }
  const runs = value.runs.map((entry) => {
    if (
      !exact(entry, ["run_id", "workflow_id", "status", "updated_at"]) ||
      !nonBlank(entry.run_id) ||
      (entry.workflow_id !== null && !nonBlank(entry.workflow_id)) ||
      !isRunStatus(entry.status) ||
      (entry.updated_at !== null && !nativeTimestamp(entry.updated_at))
    ) {
      throw new TypeError(
        "Spec Kit workflow list entries do not match the 0.14.3.dev0 JSON shape.",
      );
    }
    return {
      runId: entry.run_id,
      workflowId: entry.workflow_id,
      status: entry.status,
      updatedAt: entry.updated_at,
      runOutcome: runOutcome(entry.status),
    };
  });
  if (new Set(runs.map((run) => run.runId)).size !== runs.length) {
    throw new TypeError("Spec Kit workflow list run IDs must be unique.");
  }
  return {
    kind: "list-status",
    command: "status",
    observedAt: input.observedAt,
    version: input.version,
    raw: value as JsonObject,
    commandExitCode: 0,
    runs,
  };
};

/** Parse the real run, resume, single-status, and list-status JSON payloads. */
export const observeSpecKitWorkflowStatus = (
  rawInput: SpecKitWorkflowStatusInput,
): SpecKitWorkflowStatusObservation => {
  const input = capturePortable(rawInput, "Spec Kit workflow status input");
  assertVersion(input.version);
  if (!nativeTimestamp(input.observedAt)) {
    throw new TypeError("Spec Kit workflow status observations require a canonical timestamp.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.stdout) as unknown;
  } catch {
    throw new TypeError("Spec Kit workflow status stdout must contain exactly one JSON document.");
  }
  const value = capturePortable(parsed, "Spec Kit workflow status payload");
  if (!isPortableRecord(value)) {
    throw new TypeError("Spec Kit workflow status stdout must contain a JSON object.");
  }
  const observation = Object.hasOwn(value, "runs")
    ? parseList(value, input)
    : Object.hasOwn(value, "created_at")
      ? parseRunStatus(value, input)
      : parseRunOutcome(value, input);
  return capturePortable(observation, "Spec Kit workflow status observation");
};
