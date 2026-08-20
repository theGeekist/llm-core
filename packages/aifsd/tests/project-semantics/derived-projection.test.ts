import { describe, expect, test } from "bun:test";
import {
  buildProjectProjection,
  materialiseAssertions,
} from "../../src/project-semantics/public.js";
import { admitProjectEvent } from "../../src/project-semantics/admission.js";
import { createInMemoryProjectJournal } from "../../src/project-semantics/journal.js";
import {
  admissionRequest,
  assertion,
  authority,
  digester,
  eventId,
  generatedTaskGraphAssertions,
  projectId,
} from "./fixtures/project.js";

const admitted = async (
  sequence: number,
  kind: "assertions.recorded" | "assertions.retracted",
  payload: Record<string, unknown>,
) => {
  const result = await admitProjectEvent(
    admissionRequest(sequence, kind, payload as never),
    authority(),
    digester,
  );
  if (!result.ok) throw new Error("fixture admission failed");
  return result.value;
};

describe("project assertion and derived-state projection", () => {
  test("derives readiness and completion only from accepted assertions", async () => {
    const event = await admitted(1, "assertions.recorded", {
      assertions: [
        assertion("a-type", "task-a", "entity.type", "task"),
        assertion("a-complete", "task-a", "task.completed", true),
        assertion("b-type", "task-b", "entity.type", "task"),
        assertion("b-dependency", "task-b", "task.depends-on", "task-a"),
        assertion("b-second-dependency", "task-b", "task.depends-on", "task-c"),
        assertion("b-incomplete", "task-b", "task.completed", false),
        assertion("c-type", "task-c", "entity.type", "task"),
        assertion("c-complete", "task-c", "task.completed", true),
      ],
    });
    const projection = await buildProjectProjection([event], digester);
    expect(projection.ok).toBe(true);
    if (!projection.ok) throw new Error("projection failed");
    expect(projection.value.tasks).toEqual([
      expect.objectContaining({ taskId: "task-a", readiness: "complete" }),
      expect.objectContaining({
        taskId: "task-b",
        readiness: "ready",
        preconditionAssertionIds: [
          "a-complete",
          "a-type",
          "b-dependency",
          "b-incomplete",
          "b-second-dependency",
          "b-type",
          "c-complete",
          "c-type",
        ],
      }),
      expect.objectContaining({ taskId: "task-c", readiness: "complete" }),
    ]);
    expect(projection.value.checkpoint.lastEventId).toBe(eventId(1));
  });

  test("surfaces contradiction instead of selecting the latest assertion", async () => {
    const initial = await admitted(1, "assertions.recorded", {
      assertions: [
        assertion("task-type", "task-a", "entity.type", "task"),
        assertion("task-incomplete", "task-a", "task.completed", false),
      ],
    });
    const contradiction = await admitted(2, "assertions.recorded", {
      assertions: [assertion("task-complete", "task-a", "task.completed", true, 2)],
    });
    const projection = await buildProjectProjection([initial, contradiction], digester);
    if (!projection.ok) throw new Error("projection failed");
    expect(projection.value.tasks[0]).toEqual(
      expect.objectContaining({
        readiness: "contradictory",
        completion: "contradictory",
        contradictionAssertionIds: ["task-complete", "task-incomplete"],
      }),
    );

    const retraction = await admitted(3, "assertions.retracted", {
      assertionIds: ["task-incomplete"],
    });
    const repaired = await buildProjectProjection([initial, contradiction, retraction], digester);
    if (!repaired.ok) throw new Error("projection failed");
    expect(repaired.value.tasks[0]).toEqual(
      expect.objectContaining({ readiness: "complete", completion: "complete" }),
    );
    const assertions = materialiseAssertions([initial, contradiction, retraction]);
    if (!assertions.ok) throw new Error("materialisation failed");
    expect(assertions.value.find(({ assertionId }) => assertionId === "task-incomplete")).toEqual(
      expect.objectContaining({ retractedBy: eventId(3) }),
    );
  });

  test("rebuilds the same canonical projection from the accepted journal", async () => {
    const values = [
      assertion("a", "task-a", "entity.type", "task"),
      assertion("b", "task-a", "task.completed", false),
    ];
    const left = await admitted(1, "assertions.recorded", { assertions: values });
    const [leftProjection, rightProjection] = await Promise.all([
      buildProjectProjection([left], digester),
      buildProjectProjection([left], digester),
    ]);
    if (!leftProjection.ok || !rightProjection.ok) throw new Error("projection failed");
    expect(leftProjection.value.projectionDigest).toEqual(rightProjection.value.projectionDigest);
    expect(leftProjection.value.assertions.map(({ assertion }) => assertion.assertionId)).toEqual([
      "a",
      "b",
    ]);
  });

  test("rejects assertion provenance drift and invalid retraction targets", async () => {
    const wrongAuthority = await admitted(1, "assertions.recorded", {
      assertions: [
        {
          ...(assertion("wrong-authority", "task-a", "entity.type", "task") as object),
          authority: { authorityId: "coordinator.project-admission", kind: "worker" },
        },
      ],
    });
    expect((await buildProjectProjection([wrongAuthority], digester)).ok).toBe(false);

    const invalidInterval = await admitted(2, "assertions.recorded", {
      assertions: [
        {
          ...(assertion("invalid-interval", "task-a", "entity.type", "task", 2) as object),
          validTo: "2026-08-17T00:00:00Z",
        },
      ],
    });
    expect((await buildProjectProjection([invalidInterval], digester)).ok).toBe(false);

    const missingRetraction = await admitted(3, "assertions.retracted", {
      assertionIds: ["missing"],
    });
    expect((await buildProjectProjection([missingRetraction], digester)).ok).toBe(false);
  });

  test("derives complete, blocked and contradictory states from a generated task-graph fixture", async () => {
    const event = await admitted(1, "assertions.recorded", {
      assertions: generatedTaskGraphAssertions(),
    });
    const projection = await buildProjectProjection([event], digester);
    if (!projection.ok) throw new Error("projection failed");
    expect(projection.value.tasks).toEqual([
      expect.objectContaining({ taskId: "task-a", readiness: "complete" }),
      expect.objectContaining({
        taskId: "task-b",
        readiness: "blocked",
        blockers: ["task-c"],
        sourceEventIds: [event.eventId],
      }),
      expect.objectContaining({ taskId: "task-c", readiness: "contradictory" }),
    ]);
  });

  test("binds the documented checkpoint and projection digests to a named fixture", async () => {
    const event = await admitted(1, "assertions.recorded", {
      assertions: [
        assertion("task-a", "task-a", "entity.type", "task"),
        assertion("task-b", "task-b", "entity.type", "task"),
        assertion("dependency", "task-b", "task.depends-on", "task-a"),
      ],
    });
    const journal = createInMemoryProjectJournal(digester);
    const append = await journal.append(event);
    if (!append.ok) throw new Error("journal append failed");
    const projection = await buildProjectProjection(await journal.read(projectId), digester);
    if (!projection.ok) throw new Error("projection failed");
    expect(append.value.checkpoint.journalDigest.value).toBe(
      "1cd604a07fda8bf8b1f6df75084fb854f9f763be6967373d2eac658ba48e09f8",
    );
    expect(projection.value.projectionDigest.value).toBe(
      "ba771e4ae96ba9984272b4c3012e8c646521e3536009f0f7ea592b52426f2ad3",
    );
  });

  test("traces only assertions that affect derived task state", async () => {
    const event = await admitted(1, "assertions.recorded", {
      assertions: [
        assertion("task-type", "task-a", "entity.type", "task"),
        assertion("task-incomplete", "task-a", "task.completed", false),
        assertion("task-title", "task-a", "task.title", "Unrelated presentation fact"),
      ],
    });
    const projection = await buildProjectProjection([event], digester);
    if (!projection.ok) throw new Error("projection failed");
    expect(projection.value.tasks[0]?.preconditionAssertionIds).toEqual([
      "task-incomplete",
      "task-type",
    ]);
  });
});
