import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { coreId, externalId, type EventId } from "@geekist/llm-core/contracts";
import fc from "fast-check";
import { createArchitectureTaskPlan } from "@geekist/task-graph";
import {
  authorityLocations,
  loadAuthority,
  loadTaskGraphRuntime,
  validateGoverningReading,
} from "@geekist/task-graph/node";
import {
  createRepositoryCorpusAdapter,
  createRepositoryCorpusObservation,
} from "../../../src/project-semantics/adapters/repository-corpus/public.js";
import { contentDigest } from "../../../src/config/content-digest.js";
import { admitProjectEvent } from "../../../src/project-semantics/admission.js";
import { buildProjectProjection } from "../../../src/project-semantics/public.js";
import type { CorpusFixture } from "./fixtures/corpus.js";
import { createCorpusFixture } from "./fixtures/corpus.js";

let fixture: CorpusFixture | null = null;

afterEach(async () => {
  await fixture?.dispose();
  fixture = null;
});

const imported = async () => {
  fixture = await createCorpusFixture();
  const result = await createRepositoryCorpusAdapter().import(fixture.source);
  if (!result.ok) throw new Error(`fixture import failed: ${JSON.stringify(result.diagnostics)}`);
  return result.value;
};

const normalisedCompatibilityPlan = (
  plan: Awaited<ReturnType<typeof createArchitectureTaskPlan>>,
) =>
  plan.ordered.map(({ blockers, canStart, safetyBlockers, task }) => ({
    blockers,
    canStart: canStart && safetyBlockers.length === 0,
    safetyBlockers,
    task: task.key,
  }));

const normalisedPlan = (plan: Awaited<ReturnType<typeof createArchitectureTaskPlan>>) =>
  plan.ordered.map(
    ({ blockers, canStart, dependenciesSatisfied, lifecycleEligible, task, warnings }) => ({
      blockers,
      canStart,
      dependenciesSatisfied,
      lifecycleEligible,
      task: task.key,
      warnings,
    }),
  );

const taskGraphBinary = join(
  dirname(fileURLToPath(import.meta.resolve("@geekist/task-graph"))),
  "bin/task-graph.js",
);

const nativeCommand = async (command: readonly string[], options: { readonly cwd: string }) => {
  const process_ = Bun.spawn([...command], {
    cwd: options.cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process_.exited,
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
  ]);
  return { exitCode, stderr, stdout };
};

describe("Task Graph repository corpus adapter", () => {
  test("imports native task metadata without treating task prose as accepted truth", async () => {
    const result = await imported();
    expect(result.projectId).toBe("repository:fixture-project");
    expect(result.statuses).toEqual([
      expect.objectContaining({ matchesTaskLifecycle: true, path: "architecture/STATUS.md" }),
    ]);
    expect(result.tasks.map(({ task }) => task.key)).toEqual([
      "aifsd/active",
      "aifsd/blocked",
      "aifsd/completed",
      "aifsd/conflicted",
      "aifsd/ready",
    ]);
    expect(result.tasks.find(({ task }) => task.key === "aifsd/active")?.lifecycle).toEqual({
      leaseExpiresAt: "2026-08-22T00:00:00Z",
      leaseStartedAt: "2026-08-21T00:00:00Z",
      owner: "fixture-coordinator",
      ownerKind: "coordinator",
    });
    const observation = createRepositoryCorpusObservation({
      correlationId: externalId("fixture-import"),
      import_: result,
      observationId: "fixture-assertions",
    });
    expect(JSON.stringify(observation.payload)).toContain("task.lifecycle");
    expect(JSON.stringify(observation.payload)).not.toContain(
      "ordinary prose must remain evidence only",
    );
    const assertions = (
      observation.payload as unknown as {
        assertions: readonly {
          readonly object: unknown;
          readonly predicate: string;
          readonly subjectId: string;
        }[];
      }
    ).assertions;
    expect(assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: "decision:aifsd/ADR-001",
          predicate: "decision.source-path",
          object: "architecture/decisions/ADR-001-fixture.md",
        }),
        expect.objectContaining({
          subjectId: "task:aifsd/ready",
          predicate: "task.requires-decision",
          object: "decision:aifsd/ADR-001",
        }),
        expect.objectContaining({
          subjectId: "task:aifsd/ready",
          predicate: "task.required-reading",
          object: expect.objectContaining({
            path: "architecture/README.md",
            reason: "fixture governing authority",
            ref: null,
            role: "required-reading",
          }),
        }),
        expect.objectContaining({
          subjectId: "task:aifsd/ready",
          predicate: "task.planner-index",
          object: expect.any(Number),
        }),
        expect.objectContaining({
          subjectId: "task:aifsd/conflicted",
          predicate: "task.planner-warning",
          object: expect.objectContaining({ code: "declared-conflict" }),
        }),
        expect.objectContaining({
          subjectId: "project:repository:fixture-project",
          predicate: "project.governing-reading",
          object: expect.objectContaining({
            authority: "aifsd",
            path: "architecture/README.md",
            role: "governing",
          }),
        }),
      ]),
    );
    expect(
      result.plan.ordered
        .find(({ task }) => task.key === "aifsd/conflicted")
        ?.warnings.map(({ message }) => message),
    ).toContain("conflicts with active aifsd/active");
  });

  test("fails closed when the pinned Task Graph governing-reading preflight fails", async () => {
    fixture = await createCorpusFixture();
    const manifest = fixture.source.manifestPath;
    await writeFile(
      manifest,
      JSON.stringify({
        schemaVersion: 1,
        taskSchemaVersion: 1,
        id: "fixture-project",
        label: "Repository corpus fixture",
        workspaceRoot: ".",
        authorities: {
          aifsd: {
            architectureRoot: "architecture",
            architectureVersion: 1,
            governingReading: ["architecture/GOVERNING.md"],
            label: "Fixture authority",
            logicalMount: null,
            optional: false,
            preferredOwnerKind: "coordinator",
            reviewOwner: "fixture-reviewer",
          },
        },
      }),
    );

    const runtime = loadTaskGraphRuntime(manifest, manifest);
    expect(() =>
      validateGoverningReading(
        runtime.workspaceRoot,
        runtime.configuration.authorities.aifsd!.governingReading,
        runtime.configuration,
      ),
    ).toThrow();
    expect(await createRepositoryCorpusAdapter().import(fixture.source)).toEqual({
      ok: false,
      diagnostics: [{ code: "invalid-observation", reasonCode: "required-field-missing" }],
    });
    const cli = await nativeCommand(
      [
        process.execPath,
        taskGraphBinary,
        "--project-config",
        fixture.source.manifestPath,
        "--format",
        "json",
      ],
      { cwd: fixture.root },
    );
    expect(cli.exitCode).toBe(1);
  });

  test("matches the beta.6 failure for unavailable required reading", async () => {
    fixture = await createCorpusFixture();
    const path = join(fixture.root, "architecture", "tasks", "ready.md");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "path: architecture/README.md",
        "path: architecture/MISSING.md",
      ),
    );
    const source = {
      ...fixture.source,
      command: { run: nativeCommand },
      taskGraphCommand: [process.execPath, taskGraphBinary],
    };
    const [adapter, cli] = await Promise.all([
      createRepositoryCorpusAdapter().import(source),
      nativeCommand(
        [
          process.execPath,
          taskGraphBinary,
          "--project-config",
          source.manifestPath,
          "--format",
          "json",
        ],
        { cwd: fixture.root },
      ),
    ]);
    expect(adapter.ok).toBeFalse();
    expect(cli.exitCode).toBe(1);
  });

  test("binds repository provenance to governed document bytes", async () => {
    fixture = await createCorpusFixture();
    const first = await createRepositoryCorpusAdapter().import(fixture.source);
    if (!first.ok) throw new Error("fixture import failed");
    await writeFile(
      join(fixture.root, "architecture", "README.md"),
      "# Fixture architecture\n\nChanged governed body\n",
    );
    await writeFile(
      join(fixture.root, "architecture", "decisions", "ADR-001-fixture.md"),
      ["# ADR-001", "", "Status: accepted", "", "Changed decision body"].join("\n"),
    );
    const second = await createRepositoryCorpusAdapter().import(fixture.source);
    if (!second.ok) throw new Error("mutated fixture import failed");
    expect(second.value.revision).toBe(first.value.revision);
    expect(second.value.provenance.contentDigest).not.toEqual(first.value.provenance.contentDigest);
    for (const role of ["governing", "required-reading", "decision"] as const) {
      expect(
        second.value.documents.find((document) => document.role === role)?.contentDigest,
      ).not.toEqual(
        first.value.documents.find((document) => document.role === role)?.contentDigest,
      );
    }
  });

  test("rebuilds Task Graph order and startability from admitted planner assertions", async () => {
    const import_ = await imported();
    const observation = createRepositoryCorpusObservation({
      correlationId: externalId("fixture-rebuild"),
      import_,
      observationId: "fixture-rebuild",
    });
    const authority = {
      authorityId: observation.sourceAuthority.authorityId,
      decide: () => ({
        decisionId: "fixture-admission",
        authority: observation.sourceAuthority,
        policyId: "fixture/v1",
        decidedAt: "2026-08-21T00:01:00Z",
      }),
    };
    const admitted = await admitProjectEvent(
      { eventId: coreId<EventId>("018f0000-0000-7000-8000-000000000001"), observation },
      authority,
      { digest: contentDigest },
    );
    if (!admitted.ok) throw new Error("fixture admission failed");
    const rebuilt = await buildProjectProjection([admitted.value], { digest: contentDigest });
    if (!rebuilt.ok) throw new Error("fixture rebuild failed");
    expect(rebuilt.value.tasks.map(({ taskId }) => taskId)).toEqual(
      import_.plan.ordered.map(({ task }) => `task:${task.key}`),
    );
    expect(rebuilt.value.tasks.map(({ readiness }) => readiness)).toEqual(
      import_.plan.ordered.map(({ canStart, task }) =>
        task.status === "done" ? "complete" : canStart ? "ready" : "blocked",
      ),
    );
  });

  test("matches the installed beta.6 compatibility CLI for a legacy foreign corpus", async () => {
    fixture = await createCorpusFixture();
    const current = fixture;
    await mkdir(join(current.root, "packages", "ready"), { recursive: true });
    await writeFile(join(current.root, "packages", "ready", "dirty.ts"), "dirty\n");
    current.state.dirtyPaths = ["packages/ready/dirty.ts"];
    const source = {
      ...current.source,
      command: { run: nativeCommand },
      taskGraphCommand: [process.execPath, taskGraphBinary],
    };
    const [adapterPlan, cliPlan] = await Promise.all([
      createRepositoryCorpusAdapter().plan(source),
      nativeCommand(
        [
          process.execPath,
          taskGraphBinary,
          "--project-config",
          source.manifestPath,
          "--format",
          "json",
        ],
        { cwd: current.root },
      ),
    ]);
    if (!adapterPlan.ok || cliPlan.exitCode !== 0) throw new Error(cliPlan.stderr);
    const native = JSON.parse(cliPlan.stdout) as {
      readonly tasks: readonly {
        readonly blockers: readonly string[];
        readonly canStart: boolean;
        readonly key: string;
        readonly safetyBlockers: readonly string[];
      }[];
    };
    expect(normalisedCompatibilityPlan(adapterPlan.value.plan)).toEqual(
      native.tasks.map(({ blockers, canStart, key, safetyBlockers }) => ({
        blockers,
        canStart,
        safetyBlockers,
        task: key,
      })),
    );
    const [adapterContext, cliContext] = await Promise.all([
      createRepositoryCorpusAdapter().compileTaskContext(source, "aifsd/ready"),
      nativeCommand(
        [
          process.execPath,
          taskGraphBinary,
          "--project-config",
          source.manifestPath,
          "--context",
          "aifsd/ready",
        ],
        { cwd: current.root },
      ),
    ]);
    if (!adapterContext.ok) throw new Error("adapter context failed");
    expect(cliContext.exitCode).toBe(0);
    expect(adapterContext.value.text).toBe(cliContext.stdout);
  });

  test("uses the Task Graph CLI for context instead of recreating its compiler", async () => {
    const result = await imported();
    if (fixture === null) throw new Error("fixture was not created");
    const context = await createRepositoryCorpusAdapter().compileTaskContext(
      fixture.source,
      "aifsd/ready",
    );
    expect(context).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ taskKey: "aifsd/ready", text: "Task: aifsd/ready\n" }),
      }),
    );
    expect(fixture.calls.at(-1)).toEqual([
      "task-graph",
      "--project-config",
      fixture.source.manifestPath,
      "--context",
      "aifsd/ready",
    ]);
    expect(result.provenance.revision).toBe("0123456789abcdef0123456789abcdef01234567");
  });

  test("reports a native STATUS.md projection that diverges from task front matter", async () => {
    fixture = await createCorpusFixture();
    await writeFile(
      join(fixture.root, "architecture", "STATUS.md"),
      ["# Fixture status", "", "## Proposed", "- [active](tasks/active.md)"].join("\n"),
    );
    const result = await createRepositoryCorpusAdapter().import(fixture.source);
    if (!result.ok) throw new Error("fixture import failed");
    expect(result.value.statuses).toEqual([
      expect.objectContaining({
        matchesTaskLifecycle: false,
        mismatches: expect.arrayContaining(["aifsd/active: proposed != claimed"]),
      }),
    ]);
  });

  test("preserves Task Graph dirty-path admission across generated fixture states", async () => {
    fixture = await createCorpusFixture();
    const current = fixture;
    const runtime = loadTaskGraphRuntime(current.source.manifestPath, current.source.manifestPath);
    const locations = await authorityLocations(
      runtime.workspaceRoot,
      Object.keys(runtime.configuration.authorities),
      runtime.configuration,
    );
    const loaded = await Promise.all(
      locations.map((location) =>
        loadAuthority(runtime.workspaceRoot, location, runtime.configuration),
      ),
    );
    const decisions = loaded.flatMap((authority) => authority.decisions);
    const tasks = loaded.flatMap((authority) => authority.tasks);
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            "packages/ready/dirty.ts",
            "packages/active/dirty.ts",
            "packages/unrelated/dirty.ts",
          ),
          { maxLength: 4 },
        ),
        async (dirtyPaths) => {
          current.state.dirtyPaths = [...new Set(dirtyPaths)];
          const actual = await createRepositoryCorpusAdapter().plan(current.source);
          if (!actual.ok) throw new Error("adapter plan failed");
          const reference = await createArchitectureTaskPlan({
            configuration: runtime.configuration,
            decisions,
            dirtyPaths: current.state.dirtyPaths,
            tasks,
          });
          expect(normalisedPlan(actual.value.plan)).toEqual(normalisedPlan(reference));
        },
      ),
      { numRuns: 30 },
    );
  });
});
