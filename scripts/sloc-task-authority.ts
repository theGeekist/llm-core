import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, posix, relative, resolve, sep } from "node:path";
import { scopesOverlap } from "@geekist/task-graph";
import type { SlocWaiver } from "./check-sloc.js";

export const isFollowUpPath = (value: string): boolean => {
  if (value.includes("\\") || posix.isAbsolute(value) || posix.normalize(value) !== value) {
    return false;
  }
  const segments = value.split("/");
  const taskIndex = segments.indexOf("tasks", 3);
  return (
    segments.length >= 5 &&
    segments[0] === "packages" &&
    segments[1] !== "" &&
    segments[1] !== "." &&
    segments[1] !== ".." &&
    segments[2] === "docs" &&
    segments.slice(3).every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
    taskIndex >= 3 &&
    taskIndex === segments.length - 2 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(segments.at(-1)!)
  );
};

const packageOwner = (value: string): string | null => {
  const segments = value.split("/");
  return segments[0] === "packages" && segments.length > 2 ? (segments[1] ?? null) : null;
};

const isWithin = (parent: string, candidate: string): boolean => {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !posix.isAbsolute(path));
};

const canonicalFollowUp = (root: string, followUp: string): string | null => {
  try {
    const task = resolve(root, followUp);
    if (!lstatSync(task).isFile()) return null;
    const canonicalRoot = realpathSync(root);
    const canonicalTask = realpathSync(task);
    const packageDocs = realpathSync(resolve(root, ...followUp.split("/").slice(0, 3)));
    return isWithin(canonicalRoot, canonicalTask) && isWithin(packageDocs, canonicalTask)
      ? canonicalTask
      : null;
  } catch {
    return null;
  }
};

interface TaskFrontMatter {
  readonly id: string;
  readonly status: string;
  readonly writeScope: readonly string[];
}

const actionableTaskStatuses = new Set([
  "proposed",
  "ready",
  "claimed",
  "in_progress",
  "review",
  "blocked",
]);

interface FrontMatterFields {
  readonly fields: Map<string, string>;
  readonly writeScope: string[];
  listField?: string;
}

const appendScopeItem = (line: string, state: FrontMatterFields): boolean => {
  if (state.listField !== "write_scope" || !/^\s{2}-\s/.test(line)) return true;
  const remainder = line.slice(3);
  if (remainder.length < 2) return true;
  const captured = remainder.trimStart() || remainder.slice(-1);
  if (/[\r\n\u2028\u2029]/.test(captured)) return true;
  const item = captured.trim();
  const value = item.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
  if (value === "" || state.writeScope.includes(value)) return false;
  state.writeScope.push(value);
  return true;
};

const appendFrontMatterLine = (line: string, state: FrontMatterFields): boolean => {
  if (line.trim() === "" || line.trimStart().startsWith("#")) return true;
  if (/^\s/.test(line)) return appendScopeItem(line, state);
  const separator = line.indexOf(":");
  if (separator <= 0) return false;
  const key = line.slice(0, separator);
  if (!/^[a-z][a-z0-9_]*$/.test(key) || state.fields.has(key)) return false;
  const value = line.slice(separator + 1).trim();
  state.fields.set(key, value);
  state.listField = value === "" ? key : undefined;
  return key !== "write_scope" || value === "" || value === "[]";
};

const taskFrontMatter = (content: string): TaskFrontMatter | null => {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") return null;
  const closing = lines.indexOf("---", 1);
  if (closing < 0) return null;
  const state: FrontMatterFields = { fields: new Map(), writeScope: [] };
  if (!lines.slice(1, closing).every((line) => appendFrontMatterLine(line, state))) return null;
  const id = state.fields.get("id");
  const status = state.fields.get("status");
  return id !== undefined &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) &&
    status !== undefined &&
    state.fields.has("write_scope")
    ? { id, status, writeScope: state.writeScope }
    : null;
};

interface ActiveWaiverContext {
  readonly root: string;
  readonly sourcePath: string;
  readonly waiver: SlocWaiver;
  readonly today: string;
}

export const validateActiveWaiver = ({
  root,
  sourcePath,
  waiver,
  today,
}: ActiveWaiverContext): string[] => {
  if (waiver.followUp === undefined || waiver.expiresOn === undefined) return [];
  if (!isFollowUpPath(waiver.followUp)) return [];
  const task = canonicalFollowUp(root, waiver.followUp);
  const errors: string[] = [];
  const sourceOwner = packageOwner(sourcePath);
  const followUpOwner = packageOwner(waiver.followUp);
  if (sourceOwner !== null && followUpOwner !== sourceOwner) {
    errors.push(
      `${sourcePath} waiver follow-up must belong to package ${sourceOwner}, not ${followUpOwner ?? "repository"}`,
    );
  }
  if (task === null) {
    errors.push(
      `${sourcePath} waiver follow-up must be a non-symlink regular file within its package docs task boundary`,
    );
  } else {
    errors.push(...taskAuthorityErrors(task, sourcePath));
  }
  if (waiver.expiresOn < today) errors.push(`${sourcePath} waiver expired`);
  return errors;
};

const taskAuthorityErrors = (task: string, sourcePath: string): string[] => {
  const errors: string[] = [];
  const expectedId = basename(task, ".md");
  const frontMatter = taskFrontMatter(readFileSync(task, "utf8"));
  if (frontMatter === null) {
    errors.push(
      `${sourcePath} waiver follow-up must have canonical front matter with unique id, status and write_scope fields`,
    );
  } else if (frontMatter.id !== expectedId) {
    errors.push(`${sourcePath} waiver follow-up id must match its filename`);
  } else if (!actionableTaskStatuses.has(frontMatter.status)) {
    errors.push(
      `${sourcePath} waiver follow-up status must be actionable: proposed, ready, claimed, in_progress, review, or blocked`,
    );
  } else if (!frontMatter.writeScope.some((scope) => scopesOverlap(scope, sourcePath))) {
    errors.push(`${sourcePath} waiver follow-up write_scope does not own the waived source`);
  }

  return errors;
};
