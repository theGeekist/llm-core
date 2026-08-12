import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../../../../..");
const markdownDocumentPattern =
  /^packages\/(aifsd|llm-core)\/docs\/final-architecture\/((?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+\.md)$/u;

export interface ArchitectureDocumentReference {
  readonly browserUrl: string;
  readonly id: string;
  readonly kind: "architecture" | "decision" | "task";
  readonly label: string;
  readonly obsidianUrl: string;
  readonly path: string;
}

interface PlanTask {
  readonly authority: string;
  readonly decisionDependencies: readonly string[];
  readonly key: string;
  readonly path: string;
  readonly requiredReading: readonly {
    readonly path: string;
    readonly reason: string;
    readonly ref: string | null;
  }[];
  readonly title: string;
  readonly [key: string]: unknown;
}

interface TaskPlanShape {
  readonly tasks: readonly PlanTask[];
  readonly [key: string]: unknown;
}

const documentParts = (
  path: string,
): {
  readonly authority: "aifsd" | "llm-core";
  readonly kind: "architecture" | "decision" | "task";
} => {
  const match = path.match(markdownDocumentPattern);
  if (match === null) throw new Error("Document path is outside architecture authority");
  if (match[2]?.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("Document path is outside architecture authority");
  }
  return {
    authority: match[1] as "aifsd" | "llm-core",
    kind: path.includes("/decisions/")
      ? "decision"
      : path.includes("/tasks/")
        ? "task"
        : "architecture",
  };
};

const obsidianTarget = (authority: "aifsd" | "llm-core", path: string): string => {
  if (authority === "aifsd") {
    return `obsidian://open?vault=${encodeURIComponent("aifsd-agent-framework-research")}&file=${encodeURIComponent(path.replace(/^packages\/aifsd\/docs/u, "product/aifsd/docs"))}`;
  }
  return `obsidian://open?vault=${encodeURIComponent("llm-core")}&file=${encodeURIComponent(path)}`;
};

const reference = (path: string, id: string, label: string): ArchitectureDocumentReference => {
  const { authority, kind } = documentParts(path);
  return {
    browserUrl: `/api/document?${new URLSearchParams({ path })}`,
    id,
    kind,
    label,
    obsidianUrl: obsidianTarget(authority, path),
    path,
  };
};

const taskStage = (path: string): string => {
  const content = readArchitectureDocument(path);
  const line = content.split("\n").find((candidate) => candidate.startsWith("stage:"));
  return line?.slice("stage:".length).trim() || "unclassified";
};

const decisionReferences = (task: PlanTask): readonly ArchitectureDocumentReference[] => {
  const { authority } = documentParts(task.path);
  const directory = `packages/${authority}/docs/final-architecture/decisions`;
  const files = readdirSync(resolve(workspaceRoot, directory));
  return task.decisionDependencies.flatMap((id) => {
    const filename = files.find((candidate) => candidate.startsWith(`${id}-`));
    if (filename === undefined) return [];
    const name = filename.slice(0, -3);
    const title = name.slice(id.length + 1).replaceAll("-", " ");
    return [reference(`${directory}/${filename}`, id, `${id}: ${title}`)];
  });
};

const requiredReading = (task: PlanTask) =>
  task.requiredReading.map((item) => {
    if (!markdownDocumentPattern.test(item.path)) return item;
    const name = item.path.split("/").at(-1)?.replace(/\.md$/u, "") ?? item.path;
    return {
      ...item,
      document: reference(item.path, item.ref ?? name, name),
    };
  });

export const enrichArchitecturePlan = (plan: unknown): unknown => {
  if (typeof plan !== "object" || plan === null || !("tasks" in plan)) return plan;
  const candidate = plan as TaskPlanShape;
  if (!Array.isArray(candidate.tasks)) return plan;
  return {
    ...candidate,
    tasks: candidate.tasks.map((task) => ({
      ...task,
      decisions: decisionReferences(task),
      document: reference(task.path, task.key, task.title),
      requiredReading: requiredReading(task),
      stage: taskStage(task.path),
    })),
  };
};

export const readArchitectureDocument = (path: string): string => {
  documentParts(path);
  return readFileSync(resolve(workspaceRoot, path), "utf8");
};
