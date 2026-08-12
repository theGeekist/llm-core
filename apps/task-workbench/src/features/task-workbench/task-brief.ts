import type { TaskBrief } from "./model";

const contentLines = (content: string): readonly string[] => {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return lines;
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return closing < 0 ? lines : lines.slice(closing + 1);
};

const sectionsFrom = (content: string): ReadonlyMap<string, readonly string[]> => {
  const sections = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of contentLines(content)) {
    if (line.startsWith("## ")) {
      current = line.slice(3).trim().toLowerCase();
      sections.set(current, []);
    } else if (current !== null) {
      sections.get(current)?.push(line);
    }
  }
  return sections;
};

const prose = (lines: readonly string[] | undefined): string =>
  (lines ?? [])
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("- "))
    .join(" ");

const list = (lines: readonly string[] | undefined): readonly string[] =>
  (lines ?? [])
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());

export const parseTaskBrief = (content: string): TaskBrief => {
  const sections = sectionsFrom(content);
  return {
    acceptanceCriteria: list(sections.get("acceptance criteria")),
    blocker: prose(sections.get("blocker")),
    handoff: prose(sections.get("handoff")),
    inScope: list(sections.get("in scope")),
    objective: prose(sections.get("objective")),
    outOfScope: list(sections.get("out of scope")),
    requiredEvidence: list(sections.get("required evidence")),
    verification: list(sections.get("verification")),
    why: prose(sections.get("why this exists")),
    workLog: prose(sections.get("work log")),
  };
};
