import { taskWorkbenchConfig } from "../config";
import { copy } from "../copy";
import type { TaskBrief, WorkbenchCommand, WorkbenchDocument, WorkbenchPlan } from "../model";
import type { CreateTaskInput, CreateTaskResult } from "../../../../shared/task-authoring-contract";
import { parseTaskBrief } from "../task-brief";
import type {
  RemediationExecutionResult,
  WorkspaceRemediationInput,
  WorkspaceRemediationPreview,
} from "../../../../shared/remediation-contract";

const decode = async <Value>(response: Response): Promise<Value> => {
  const value = (await response.json()) as Value & { error?: string };
  if (!response.ok) throw new Error(value.error ?? copy.errors.requestFailed(response.status));
  return value;
};

export const loadPlan = async (): Promise<WorkbenchPlan> =>
  decode<WorkbenchPlan>(await fetch(taskWorkbenchConfig.planEndpoint));

export const loadContext = async (task: string): Promise<string> => {
  const query = new URLSearchParams({ task });
  const value = await decode<{ content: string }>(
    await fetch(`${taskWorkbenchConfig.contextEndpoint}?${query}`),
  );
  return value.content;
};

export const rawTaskUrl = (task: string): string => {
  const query = new URLSearchParams({ task });
  return `${taskWorkbenchConfig.rawEndpoint}?${query}`;
};

export const loadTaskBrief = async (task: string): Promise<TaskBrief> => {
  const response = await fetch(rawTaskUrl(task));
  if (!response.ok) throw new Error(copy.errors.taskBriefRequestFailed(response.status));
  return parseTaskBrief(await response.text());
};

export const loadDocument = async (document: WorkbenchDocument): Promise<string> => {
  const response = await fetch(document.browserUrl);
  if (!response.ok) throw new Error(copy.errors.documentRequestFailed(response.status));
  return response.text();
};

export const loadCommands = async (): Promise<readonly WorkbenchCommand[]> => {
  const value = await decode<{ commands: readonly WorkbenchCommand[] }>(
    await fetch(taskWorkbenchConfig.commandsEndpoint),
  );
  return value.commands;
};

export const runCommand = async (
  id: string,
  task: string,
): Promise<{ readonly command: WorkbenchCommand; readonly output: string }> =>
  decode(
    await fetch(taskWorkbenchConfig.runEndpoint, {
      body: JSON.stringify({ id, task }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

export const createTask = async (
  input: CreateTaskInput,
): Promise<CreateTaskResult<WorkbenchPlan>> =>
  decode(
    await fetch(taskWorkbenchConfig.tasksEndpoint, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

export const previewRemediation = async (
  input: WorkspaceRemediationInput,
): Promise<WorkspaceRemediationPreview> =>
  decode(
    await fetch(taskWorkbenchConfig.remediationPreviewEndpoint, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

export const executeRemediation = async (
  token: string,
): Promise<RemediationExecutionResult<WorkbenchPlan>> =>
  decode(
    await fetch(taskWorkbenchConfig.remediationExecuteEndpoint, {
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
