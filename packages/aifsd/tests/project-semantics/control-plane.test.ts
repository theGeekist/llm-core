import { describe, expect, test } from "bun:test";
import {
  createProjectControlPlane,
  type ProjectProjectionStore,
} from "../../src/application/project/public.js";
import { type ProjectProjection } from "../../src/project-semantics/public.js";
import { createInMemoryProjectJournal } from "../../src/project-semantics/journal.js";
import { admissionRequest, assertion, authority, digester, projectId } from "./fixtures/project.js";

const storeFixture = (): ProjectProjectionStore & {
  drift: () => void;
  driftLastEventId: () => void;
} => {
  let projection: ProjectProjection | null = null;
  return {
    read: async () => projection,
    replace: async (next) => {
      projection = next;
    },
    drift: () => {
      if (projection !== null) {
        projection = {
          ...projection,
          protocolVersion: "aifsd.project-projection/1",
          checkpoint: { ...projection.checkpoint, position: 0 },
          tasks: [],
        };
      }
    },
    driftLastEventId: () => {
      if (projection !== null) {
        projection = {
          ...projection,
          checkpoint: {
            ...projection.checkpoint,
            lastEventId: "018f0000-0000-7000-8000-000000000099" as never,
          },
        };
      }
    },
  };
};

describe("project control plane", () => {
  test("routes admission through the journal before replacing the projection", async () => {
    const store = storeFixture();
    const service = createProjectControlPlane({
      journal: createInMemoryProjectJournal(digester),
      projectionStore: store,
      admissionAuthority: authority(),
      digester,
    });
    const result = await service.admit(
      admissionRequest(1, "assertions.recorded", {
        assertions: [assertion("task", "task-a", "entity.type", "task")],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("admission failed");
    expect(result.value.append.disposition).toBe("appended");
    expect(result.value.view.projectionFresh).toBe(true);
    expect(result.value.view.tasks[0]).toEqual(
      expect.objectContaining({ taskId: "task-a", readiness: "ready" }),
    );
    const replay = await service.admit(
      admissionRequest(1, "assertions.recorded", {
        assertions: [assertion("task", "task-a", "entity.type", "task")],
      }),
    );
    if (!replay.ok) throw new Error("replay failed");
    expect(replay.value.append.disposition).toBe("already-present");
    expect(replay.value.append.event).toEqual(result.value.append.event);
    expect(replay.value.view).toEqual(result.value.view);
  });

  test("reports a stale projection and rebuilds only from journal authority", async () => {
    const store = storeFixture();
    const service = createProjectControlPlane({
      journal: createInMemoryProjectJournal(digester),
      projectionStore: store,
      admissionAuthority: authority(),
      digester,
    });
    const admitted = await service.admit(
      admissionRequest(1, "assertions.recorded", {
        assertions: [assertion("task", "task-a", "entity.type", "task")],
      }),
    );
    expect(admitted.ok).toBe(true);
    store.drift();
    const stale = await service.view(projectId);
    expect(stale.ok).toBe(true);
    if (!stale.ok) throw new Error("view failed");
    expect(stale.value.projectionFresh).toBe(false);
    expect(stale.value.tasks).toEqual([
      expect.objectContaining({ taskId: "task-a", readiness: "ready" }),
    ]);
    const rebuilt = await service.rebuild(projectId);
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) throw new Error("rebuild failed");
    expect(rebuilt.value.projectionFresh).toBe(true);
  });

  test("treats a foreign last event identity as a stale checkpoint", async () => {
    const store = storeFixture();
    const service = createProjectControlPlane({
      journal: createInMemoryProjectJournal(digester),
      projectionStore: store,
      admissionAuthority: authority(),
      digester,
    });
    expect(
      (
        await service.admit(
          admissionRequest(1, "assertions.recorded", {
            assertions: [assertion("task", "task-a", "entity.type", "task")],
          }),
        )
      ).ok,
    ).toBeTrue();
    store.driftLastEventId();
    const viewed = await service.view(projectId);
    if (!viewed.ok) throw new Error("view failed");
    expect(viewed.value.projectionFresh).toBeFalse();
  });
});
