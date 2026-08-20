import { canonicalize } from "@aifsd/strict-json";
import type { DerivedTaskState, EventId, MaterialisedAssertion } from "./contract.js";

const activeAt =
  (validAt: string) =>
  (assertion: MaterialisedAssertion): boolean =>
    assertion.retractedBy === null &&
    assertion.validFrom <= validAt &&
    (assertion.validTo === undefined || validAt < assertion.validTo);

const strings = (
  assertions: readonly MaterialisedAssertion[],
  validAt: string,
): readonly string[] =>
  assertions
    .filter(activeAt(validAt))
    .map(({ object }) => object)
    .filter((value): value is string => typeof value === "string")
    .sort();

const booleans = (
  assertions: readonly MaterialisedAssertion[],
  validAt: string,
): readonly boolean[] =>
  assertions
    .filter(activeAt(validAt))
    .map(({ object }) => object)
    .filter((value): value is boolean => typeof value === "boolean");

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

const taskIds = (
  assertions: readonly MaterialisedAssertion[],
  validAt: string,
): readonly string[] =>
  [
    ...unique(
      assertions
        .filter(activeAt(validAt))
        .filter(({ predicate }) => predicate === "entity.type")
        .filter(({ object }) => object === "task")
        .map(({ subjectId }) => subjectId),
    ),
  ].sort();

export const deriveTaskStates = (
  assertions: readonly MaterialisedAssertion[],
  validAt: string,
): readonly DerivedTaskState[] => {
  const byTaskPredicate = (taskId: string, predicate: string) =>
    assertions.filter(
      (assertion) => assertion.subjectId === taskId && assertion.predicate === predicate,
    );
  const completionByTask = new Map<string, DerivedTaskState["completion"]>();
  for (const taskId of taskIds(assertions, validAt)) {
    const values = unique(booleans(byTaskPredicate(taskId, "task.completed"), validAt));
    completionByTask.set(
      taskId,
      values.length === 0
        ? "unknown"
        : values.length > 1
          ? "contradictory"
          : values[0]
            ? "complete"
            : "incomplete",
    );
  }
  return taskIds(assertions, validAt).map((taskId) => {
    const dependencies = unique(strings(byTaskPredicate(taskId, "task.depends-on"), validAt));
    const blockers = unique(strings(byTaskPredicate(taskId, "task.blocked-by"), validAt));
    const completion = completionByTask.get(taskId) ?? "unknown";
    const taskAssertions = assertions
      .filter(activeAt(validAt))
      .filter(({ subjectId }) => subjectId === taskId)
      .filter(({ predicate }) =>
        ["entity.type", "task.completed", "task.depends-on", "task.blocked-by"].includes(predicate),
      );
    const conflictingGroups = new Map<string, MaterialisedAssertion[]>();
    for (const assertion of taskAssertions.filter(
      ({ predicate }) => predicate === "entity.type" || predicate === "task.completed",
    )) {
      const key = `${assertion.predicate}:${canonicalize(assertion.object)}`;
      const predicateValues = taskAssertions.filter(
        ({ predicate }) => predicate === assertion.predicate,
      );
      if (unique(predicateValues.map(({ object }) => canonicalize(object))).length > 1) {
        conflictingGroups.set(key, predicateValues);
      }
    }
    const contradictionAssertionIds = [
      ...unique(
        [...conflictingGroups.values()].flatMap((group) =>
          group.map(({ assertionId }) => assertionId),
        ),
      ),
    ].sort();
    const dependencyBlocked = dependencies.filter(
      (dependency) => completionByTask.get(dependency) !== "complete",
    );
    const dependencyAssertions = assertions
      .filter(activeAt(validAt))
      .filter(({ subjectId }) => dependencies.includes(subjectId))
      .filter(({ predicate }) => predicate === "entity.type" || predicate === "task.completed");
    const preconditionAssertions = [...taskAssertions, ...dependencyAssertions];
    const sourceEventIds = unique(
      preconditionAssertions.map(({ sourceEventId }) => sourceEventId),
    ) as readonly EventId[];
    const contradictory = contradictionAssertionIds.length > 0 || completion === "contradictory";
    const readiness = contradictory
      ? "contradictory"
      : completion === "complete"
        ? "complete"
        : blockers.length > 0 || dependencyBlocked.length > 0
          ? "blocked"
          : "ready";
    return {
      taskId,
      readiness,
      completion,
      dependencies,
      blockers: [...blockers, ...dependencyBlocked].sort(),
      preconditionAssertionIds: [
        ...unique(preconditionAssertions.map(({ assertionId }) => assertionId)),
      ].sort(),
      contradictionAssertionIds,
      sourceEventIds,
    };
  });
};
