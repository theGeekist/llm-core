import { describe, expect, test } from "bun:test";
import {
  createProjectControlPlane,
  type ProjectProjectionStore,
} from "../../src/application/project/public.js";
import {
  type ProjectProjection,
} from "../../src/project-semantics/public.js";
import { createInMemoryProjectJournal } from "../../src/project-semantics/journal.js";
import { admissionRequest, assertion, authority, digester, projectId } from "./fixtures/project.js";

const storeFixture = (): ProjectProjectionStore & { drift: () => void } => {
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
    expect(result.value.projectionFresh).toBe(true);
    expect(result.value.tasks[0]).toEqual(
      expect.objectContaining({ taskId: "task-a", readiness: "ready" }),
    );
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
});
