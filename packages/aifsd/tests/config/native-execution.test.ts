import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  applyPlan,
  planChanges,
  type ConfigurationResult,
  type ArtifactWriter,
  type MaybePromise,
} from "../../src/config/index.js";
import { createLockFixture } from "./fixtures/configuration.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const synchronous = <T>(value: MaybePromise<T>): T => {
  if (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value
  ) {
    throw new Error("Expected synchronous MaybePromise branch");
  }
  return value as T;
};

const unwrap = <T>(result: ConfigurationResult<T>): T => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result.value;
};

describe("native materialization round trip", () => {
  test("runs with Node after AIFSD leaves the execution path", () => {
    const fixture = resolve(import.meta.dir, "fixtures/native-project");
    const workspace = mkdtempSync(join(tmpdir(), "aifsd-native-fixture-"));
    temporaryDirectories.push(workspace);
    cpSync(fixture, workspace, { recursive: true });

    const lock = createLockFixture();
    const output = 'export const message = "materialized-without-aifsd";\n';
    const plan = planChanges({
      lock,
      desired: [
        {
          path: "generated/aifsd-config.mjs",
          ownership: "aifsd-owned",
          content: output,
        },
      ],
      workspace: { artifacts: [] },
    });
    const writer: ArtifactWriter = {
      observe: () => null,
      apply: (change) => {
        if (change.content === undefined) {
          return "conflict";
        }
        const target = resolve(workspace, change.path);
        if (!target.startsWith(`${workspace}/`)) {
          return "conflict";
        }
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, change.content, "utf8");
        return "applied";
      },
    };

    const materialized = unwrap(
      synchronous(
        applyPlan(plan, {
          approvedPlanDigest: plan.planDigest,
          lock,
          writer,
        }),
      ),
    );
    expect(materialized.applied.map(({ path }) => path)).toEqual(["generated/aifsd-config.mjs"]);

    const nodeExecutable = Bun.which("node");
    expect(nodeExecutable).not.toBeNull();
    if (nodeExecutable === null) {
      throw new Error("Node executable is required for the native execution test");
    }
    const nativeExecution = spawnSync(nodeExecutable, ["index.mjs"], {
      cwd: workspace,
      encoding: "utf8",
    });

    expect(nativeExecution.status).toBe(0);
    expect(nativeExecution.stderr).toBe("");
    expect(nativeExecution.stdout.trim()).toBe(
      "AIFSD_NATIVE_FIXTURE_OK:materialized-without-aifsd",
    );
  });
});
