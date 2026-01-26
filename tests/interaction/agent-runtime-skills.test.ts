import { describe, expect, it } from "bun:test";
import type {
  AdapterDiagnostic,
  SkillLoadRequest,
  SkillLoader,
  SkillSnapshotEntry,
} from "../../src/adapters/types";
import type { InteractionState } from "../../src/interaction/types";
import { resolveAgentSkills } from "../../src/interaction/agent-runtime-skills";
import type { TraceEvent } from "../../src/shared/reporting";

const createSkillEntry = (
  input: Partial<SkillSnapshotEntry> & Pick<SkillSnapshotEntry, "id" | "scope" | "path" | "hash">,
): SkillSnapshotEntry => ({
  id: input.id,
  scope: input.scope,
  path: input.path,
  hash: input.hash,
});

const createUnsafeSkillEntry = (entry: {
  id: unknown;
  scope: SkillSnapshotEntry["scope"];
  path: unknown;
  hash: unknown;
}) => entry as SkillSnapshotEntry;

const createTraceEntry = (snapshot: { skills?: SkillSnapshotEntry[] }): TraceEvent => ({
  kind: "agent.loop.snapshot",
  at: "2024-01-01T00:00:00.000Z",
  data: { snapshot },
});

const createInteractionState = (trace: TraceEvent[]): InteractionState => ({
  messages: [],
  diagnostics: [],
  trace,
});

const readSkillState = async (value: ReturnType<typeof resolveAgentSkills>) =>
  value ? await value : null;

const createLoader = (response: {
  skills: SkillSnapshotEntry[];
  diagnostics?: AdapterDiagnostic[];
}) => {
  const load = (_request: SkillLoadRequest) => response;
  return { load };
};

const createTrackedLoader = (
  response: { skills: SkillSnapshotEntry[] },
  record: SkillLoadRequest[],
) => {
  const load = (request: SkillLoadRequest) => {
    record.push(request);
    return response;
  };
  return { load };
};

describe("resolveAgentSkills", () => {
  it("returns null when no skill directories are configured", async () => {
    const result = await readSkillState(
      resolveAgentSkills({ config: { skills: { directories: [] } } }),
    );

    expect(result).toBeNull();
  });

  it("reports a diagnostic when skills are configured without a loader", async () => {
    const result = await readSkillState(
      resolveAgentSkills({ config: { skills: { directories: ["./skills"] } } }),
    );

    expect(result?.diagnostics[0]?.kind).toBe("contract");
    expect(result?.diagnostics[0]?.message).toBe("Skill adapter missing for agent loop.");
    expect(result?.skills).toBeUndefined();
  });

  it("normalizes and dedupes skills while reporting invalid entries", async () => {
    const diagnostics: AdapterDiagnostic[] = [{ level: "warn", message: "adapter warning" }];
    const skills: SkillSnapshotEntry[] = [
      createSkillEntry({ id: "  skill-a ", scope: "repo", path: " /repo/a ", hash: "hash-1" }),
      createSkillEntry({ id: "skill-a", scope: "repo", path: "/repo/a", hash: "hash-1" }),
      createSkillEntry({ id: "", scope: "repo", path: "/repo/invalid", hash: "hash-2" }),
      createSkillEntry({ id: "skill-b", scope: "system", path: "/sys/b", hash: "hash-0" }),
    ];
    const loader = createLoader({ skills, diagnostics });
    const result = await readSkillState(
      resolveAgentSkills({
        config: { skills: { directories: ["./skills"] } },
        adapters: { skills: loader as SkillLoader },
      }),
    );

    expect(result?.skills).toEqual([
      createSkillEntry({ id: "skill-a", scope: "repo", path: "/repo/a", hash: "hash-1" }),
      createSkillEntry({ id: "skill-b", scope: "system", path: "/sys/b", hash: "hash-0" }),
    ]);
    const kinds = result?.diagnostics.map((entry) => entry.kind) ?? [];
    expect(kinds).toContain("adapter");
    expect(kinds).toContain("contract");
  });

  it("drops entries with non-string fields and sorts by scope/id/path/hash", async () => {
    const raw: SkillSnapshotEntry[] = [
      createSkillEntry({ id: "b", scope: "system", path: "/b", hash: "2" }),
      createSkillEntry({ id: "a", scope: "system", path: "/b", hash: "1" }),
      createSkillEntry({ id: "a", scope: "repo", path: "/a", hash: "1" }),
      createSkillEntry({ id: "a", scope: "repo", path: "/z", hash: "1" }),
      createSkillEntry({ id: "a", scope: "repo", path: "/a", hash: "2" }),
      createUnsafeSkillEntry({ id: 123, scope: "repo", path: "/bad", hash: "x" }),
      createUnsafeSkillEntry({
        id: "bad",
        scope: "repo",
        path: 42 as unknown as string,
        hash: "x",
      }),
      createUnsafeSkillEntry({
        id: "bad",
        scope: "repo",
        path: "/bad",
        hash: null as unknown as string,
      }),
    ];
    const loader = createLoader({ skills: raw });
    const result = await readSkillState(
      resolveAgentSkills({
        config: { skills: { directories: ["./skills"] } },
        adapters: { skills: loader as SkillLoader },
      }),
    );

    expect(result?.skills).toEqual([
      createSkillEntry({ id: "a", scope: "repo", path: "/a", hash: "1" }),
      createSkillEntry({ id: "a", scope: "repo", path: "/a", hash: "2" }),
      createSkillEntry({ id: "a", scope: "repo", path: "/z", hash: "1" }),
      createSkillEntry({ id: "a", scope: "system", path: "/b", hash: "1" }),
      createSkillEntry({ id: "b", scope: "system", path: "/b", hash: "2" }),
    ]);
  });

  it("emits resume diagnostics when snapshots differ", async () => {
    const previous = [
      createSkillEntry({ id: "skill-1", scope: "repo", path: "/repo", hash: "h1" }),
    ];
    const next = [createSkillEntry({ id: "skill-1", scope: "repo", path: "/repo", hash: "h2" })];
    const loader = createLoader({ skills: next });
    const state = createInteractionState([createTraceEntry({ skills: previous })]);
    const result = await readSkillState(
      resolveAgentSkills({
        config: { skills: { directories: ["./skills"] } },
        adapters: { skills: loader as SkillLoader },
        state,
      }),
    );

    const messages = result?.diagnostics.map((entry) => entry.message) ?? [];
    expect(messages).toContain("Skill snapshot mismatch on resume.");
  });

  it("emits resume diagnostics when snapshot lengths differ", async () => {
    const previous = [
      createSkillEntry({ id: "skill-1", scope: "repo", path: "/repo", hash: "h1" }),
      createSkillEntry({ id: "skill-2", scope: "repo", path: "/repo", hash: "h2" }),
    ];
    const next = [createSkillEntry({ id: "skill-1", scope: "repo", path: "/repo", hash: "h1" })];
    const loader = createLoader({ skills: next });
    const state = createInteractionState([createTraceEntry({ skills: previous })]);
    const result = await readSkillState(
      resolveAgentSkills({
        config: { skills: { directories: ["./skills"] } },
        adapters: { skills: loader as SkillLoader },
        state,
      }),
    );

    const messages = result?.diagnostics.map((entry) => entry.message) ?? [];
    expect(messages).toContain("Skill snapshot mismatch on resume.");
  });

  it("returns empty skills when all entries are invalid", async () => {
    const loader = createLoader({
      skills: [
        createUnsafeSkillEntry({ id: 123, scope: "repo", path: "/bad", hash: "x" }),
        createUnsafeSkillEntry({
          id: "ok",
          scope: "repo",
          path: "/bad",
          hash: null as unknown as string,
        }),
      ],
    });
    const result = await readSkillState(
      resolveAgentSkills({
        config: { skills: { directories: ["./skills"] } },
        adapters: { skills: loader as SkillLoader },
      }),
    );

    expect(result?.skills).toEqual([]);
  });

  it("orders by hash when scope/id/path match", async () => {
    const loader = createLoader({
      skills: [
        createSkillEntry({ id: "skill", scope: "repo", path: "/same", hash: "a" }),
        createSkillEntry({ id: "skill", scope: "repo", path: "/same", hash: "b" }),
      ],
    });
    const result = await readSkillState(
      resolveAgentSkills({
        config: { skills: { directories: ["./skills"] } },
        adapters: { skills: loader as SkillLoader },
      }),
    );

    expect(result?.skills).toEqual([
      createSkillEntry({ id: "skill", scope: "repo", path: "/same", hash: "a" }),
      createSkillEntry({ id: "skill", scope: "repo", path: "/same", hash: "b" }),
    ]);
  });

  it("sorts hashes when inputs are reversed", async () => {
    const loader = createLoader({
      skills: [
        createSkillEntry({ id: "skill", scope: "repo", path: "/same", hash: "b" }),
        createSkillEntry({ id: "skill", scope: "repo", path: "/same", hash: "a" }),
      ],
    });
    const result = await readSkillState(
      resolveAgentSkills({
        config: { skills: { directories: ["./skills"] } },
        adapters: { skills: loader as SkillLoader },
      }),
    );

    expect(result?.skills).toEqual([
      createSkillEntry({ id: "skill", scope: "repo", path: "/same", hash: "a" }),
      createSkillEntry({ id: "skill", scope: "repo", path: "/same", hash: "b" }),
    ]);
  });

  it("uses the latest snapshot when multiple entries exist", async () => {
    const previous = [
      createSkillEntry({ id: "skill-1", scope: "repo", path: "/repo", hash: "h1" }),
    ];
    const latest = [createSkillEntry({ id: "skill-1", scope: "repo", path: "/repo", hash: "h2" })];
    const loader = createLoader({ skills: latest });
    const state = createInteractionState([
      createTraceEntry({ skills: previous }),
      createTraceEntry({ skills: latest }),
    ]);
    const result = await readSkillState(
      resolveAgentSkills({
        config: { skills: { directories: ["./skills"] } },
        adapters: { skills: loader as SkillLoader },
        state,
      }),
    );

    const messages = result?.diagnostics.map((entry) => entry.message) ?? [];
    expect(messages).not.toContain("Skill snapshot mismatch on resume.");
  });

  it("passes disabled skills to the loader", async () => {
    const requests: SkillLoadRequest[] = [];
    const loader = createTrackedLoader(
      { skills: [createSkillEntry({ id: "skill-1", scope: "repo", path: "/repo", hash: "h1" })] },
      requests,
    );
    const result = await readSkillState(
      resolveAgentSkills({
        config: { skills: { directories: ["./skills"], disabled: ["legacy"] } },
        adapters: { skills: loader as SkillLoader },
      }),
    );

    expect(result?.skills?.length).toBe(1);
    expect(requests[0]?.disabled).toEqual(["legacy"]);
  });
});
