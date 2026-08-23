import { afterEach, describe, expect, test } from "bun:test";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { externalId, type CorrelationId, type EventId } from "@geekist/llm-core/contracts";
import {
  createNativeTaskExecutionIntent,
  nativeTaskOperationDigest,
} from "../../packages/aifsd/src/project-semantics/adapters/native-task-authority/public.js";
import type { NativeTaskOperation } from "../../packages/aifsd/src/application/headless-workbench/public.js";
import { createFileNativeTaskIntentStore } from "./file-native-task-intent-store.js";

let directory: string | null = null;

afterEach(async () => {
  if (directory !== null) await rm(directory, { force: true, recursive: true });
  directory = null;
});

const operation = (): NativeTaskOperation => ({
  correlationId: externalId<CorrelationId>("file-native-intent"),
  eventId: "018f5000-0000-7000-8000-000000000001" as EventId,
  kind: "claimTask",
  leaseExpiresAt: "2026-08-23T01:00:00Z",
  operationId: "file-native-intent-1",
  projectId: "repository:fixture",
  taskKey: "aifsd/ready",
});

const waitForFile = async (path: string): Promise<boolean> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await readFile(path, "utf8")) !== "") return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
  }
  return false;
};

const reserveInBunProcess = (filePath: string) => {
  const storeModule = new URL("./file-native-task-intent-store.ts", import.meta.url).href;
  const intentModule = new URL(
    "../../packages/aifsd/src/project-semantics/adapters/native-task-authority/intent-store.ts",
    import.meta.url,
  ).href;
  const script = `
    import { createFileNativeTaskIntentStore } from ${JSON.stringify(storeModule)};
    import { createNativeTaskExecutionIntent } from ${JSON.stringify(intentModule)};
    const operation = {
      correlationId: "two-process-correlation",
      eventId: "018f5000-0000-7000-8000-000000000002",
      kind: "claimTask",
      leaseExpiresAt: "2026-08-24T01:00:00Z",
      operationId: "two-process-operation",
      projectId: "repository:fixture",
      taskKey: "aifsd/ready",
    };
    const intent = createNativeTaskExecutionIntent({
      authorityId: "fixture-authority",
      operation,
      payload: { command: "canonical-parent" },
    });
    console.log(JSON.stringify(await createFileNativeTaskIntentStore(${JSON.stringify(filePath)}, {
      lockRetryMs: 5,
    }).reserve(operation, intent)));
  `;
  return Bun.spawn(["bun", "-e", script], { stderr: "pipe", stdout: "pipe" });
};

const processResult = async (child: ReturnType<typeof reserveInBunProcess>) => {
  const output = await new Response(child.stdout).text();
  const error = await new Response(child.stderr).text();
  expect(await child.exited).toBe(0);
  expect(error).toBe("");
  return JSON.parse(output.trim()) as {
    readonly ok: boolean;
    readonly value?: { readonly disposition?: string };
  };
};

describe("file native task intent store", () => {
  test("atomically reserves one exact intent across independent store instances", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-"));
    const path = join(directory, "intents.json");
    const first = createFileNativeTaskIntentStore(path, { lockRetryMs: 5 });
    const second = createFileNativeTaskIntentStore(path, { lockRetryMs: 5 });
    const nativeOperation = operation();
    const intent = createNativeTaskExecutionIntent({
      authorityId: "fixture-authority",
      operation: nativeOperation,
      payload: { command: "exact" },
    });

    const results = await Promise.all([
      first.reserve(nativeOperation, intent),
      second.reserve(nativeOperation, intent),
    ]);
    expect(
      results.map((result) => (result.ok ? result.value.disposition : "denied")).sort(),
    ).toEqual(["already-present", "reserved"]);
    expect(await createFileNativeTaskIntentStore(path).read(nativeOperation)).toEqual({
      ok: true,
      value: intent,
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("rejects changed operation meaning or intent under the same durable identity", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-conflict-"));
    const store = createFileNativeTaskIntentStore(join(directory, "intents.json"));
    const original = operation();
    const intent = createNativeTaskExecutionIntent({
      authorityId: "fixture-authority",
      operation: original,
      payload: { command: "first" },
    });
    expect((await store.reserve(original, intent)).ok).toBeTrue();

    const changedOperation = { ...original, leaseExpiresAt: "2026-08-23T02:00:00Z" };
    const changedIntent = createNativeTaskExecutionIntent({
      authorityId: "fixture-authority",
      operation: changedOperation,
      payload: { command: "second" },
    });
    expect((await store.read(changedOperation)).ok).toBeFalse();
    expect((await store.reserve(changedOperation, changedIntent)).ok).toBeFalse();

    const alternateIntent = createNativeTaskExecutionIntent({
      authorityId: "fixture-authority",
      operation: original,
      payload: { command: "alternate" },
    });
    expect((await store.reserve(original, alternateIntent)).ok).toBeFalse();
  });

  test("fails closed when stored integrity or document schema is substituted", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-corrupt-"));
    const path = join(directory, "intents.json");
    const store = createFileNativeTaskIntentStore(path);
    const nativeOperation = operation();
    const intent = createNativeTaskExecutionIntent({
      authorityId: "fixture-authority",
      operation: nativeOperation,
      payload: { command: "exact" },
    });
    await store.reserve(nativeOperation, intent);
    const document = JSON.parse(await readFile(path, "utf8")) as {
      intents: Array<{ intent: { integrityDigest: string; operationDigest: string } }>;
    };
    document.intents[0]!.intent.operationDigest = nativeTaskOperationDigest({
      ...nativeOperation,
      leaseExpiresAt: "2026-08-23T02:00:00Z",
    });
    await writeFile(path, `${JSON.stringify(document)}\n`);
    expect((await store.read(nativeOperation)).ok).toBeFalse();

    await writeFile(path, `${JSON.stringify({ intents: [], protocolVersion: "foreign", x: 1 })}\n`);
    expect((await store.read(nativeOperation)).ok).toBeFalse();
  });

  test("recovers an ownerless reclaim guard left by an interrupted reclaimer", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-reclaim-"));
    const path = join(directory, "intents.json");
    await mkdir(`${path}.lock.reclaim`);

    const nativeOperation = operation();
    const result = await createFileNativeTaskIntentStore(path, {
      lockRetryMs: 5,
      lockTimeoutMs: 250,
    }).reserve(
      nativeOperation,
      createNativeTaskExecutionIntent({
        authorityId: "fixture-authority",
        operation: nativeOperation,
        payload: { command: "recover-reclaim" },
      }),
    );

    expect(result).toEqual(expect.objectContaining({ ok: true }));
  });

  test("fails closed when a live PID owns a lock from an unprovable incarnation", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-incarnation-"));
    const path = join(directory, "intents.json");
    const token = "018f5000-0000-4000-8000-000000000099";
    const ownerPath = `${path}.lock.${token}.owner`;
    await writeFile(
      ownerPath,
      `${JSON.stringify({
        incarnation: "018f5000-0000-4000-8000-000000000098",
        pid: process.pid,
        token,
      })}\n`,
    );
    await link(ownerPath, `${path}.lock`);

    const nativeOperation = operation();
    expect(
      await createFileNativeTaskIntentStore(path, {
        lockRetryMs: 5,
        lockTimeoutMs: 50,
      }).reserve(
        nativeOperation,
        createNativeTaskExecutionIntent({
          authorityId: "fixture-authority",
          operation: nativeOperation,
          payload: { command: "do-not-steal-reused-pid" },
        }),
      ),
    ).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });
  });

  test("accepts ownership only when the complete linked owner still matches", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-owner-race-"));
    const path = join(directory, "intents.json");
    let substituted = false;
    const nativeOperation = operation();

    expect(
      await createFileNativeTaskIntentStore(path, {
        lockLinkedObserver: async (linkedPath) => {
          if (!linkedPath.endsWith("/intents.json.lock") || substituted) return;
          substituted = true;
          const replacement = `${linkedPath}.replacement`;
          await writeFile(
            replacement,
            `${JSON.stringify({
              incarnation: "018f5000-0000-4000-8000-000000000097",
              pid: process.pid,
              token: "018f5000-0000-4000-8000-000000000096",
            })}\n`,
          );
          await rename(replacement, linkedPath);
        },
        lockRetryMs: 5,
        lockTimeoutMs: 50,
      }).reserve(
        nativeOperation,
        createNativeTaskExecutionIntent({
          authorityId: "fixture-authority",
          operation: nativeOperation,
          payload: { command: "owner-reread" },
        }),
      ),
    ).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });
    expect(substituted).toBeTrue();
  });

  test("rejects invalid or unbounded lock timing before filesystem work", () => {
    const path = join(tmpdir(), "unreachable-aifsd-native-intents.json");
    for (const options of [
      { lockRetryMs: 0 },
      { lockRetryMs: Number.NaN },
      { lockTimeoutMs: Number.POSITIVE_INFINITY },
      { lockTimeoutMs: 86_400_001 },
      { lockRetryMs: 50, lockTimeoutMs: 25 },
    ]) {
      expect(() => createFileNativeTaskIntentStore(path, options)).toThrow(RangeError);
    }
  });

  test("uses one authority for real and symlinked parents across two processes", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-canonical-parent-"));
    const canonicalParent = join(directory, "authority");
    const aliasParent = join(directory, "alias");
    await mkdir(canonicalParent);
    await symlink(canonicalParent, aliasParent, "dir");

    const results = await Promise.all([
      processResult(reserveInBunProcess(join(canonicalParent, "intents.json"))),
      processResult(reserveInBunProcess(join(aliasParent, "intents.json"))),
    ]);
    expect(results.every(({ ok }) => ok)).toBeTrue();
    expect(results.map(({ value }) => value?.disposition).sort()).toEqual([
      "already-present",
      "reserved",
    ]);
  });

  test("rejects symlink, non-regular and hard-linked document targets", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-target-kind-"));
    const nativeOperation = operation();
    const canonicalPath = join(directory, "canonical.json");
    const intent = createNativeTaskExecutionIntent({
      authorityId: "fixture-authority",
      operation: nativeOperation,
      payload: { command: "target-kind" },
    });
    expect(
      await createFileNativeTaskIntentStore(canonicalPath).reserve(nativeOperation, intent),
    ).toEqual(expect.objectContaining({ ok: true }));

    const symlinkPath = join(directory, "symlink.json");
    await symlink(canonicalPath, symlinkPath);
    expect(await createFileNativeTaskIntentStore(symlinkPath).read(nativeOperation)).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });

    const hardLinkPath = join(directory, "hard-link.json");
    await link(canonicalPath, hardLinkPath);
    expect(await createFileNativeTaskIntentStore(canonicalPath).read(nativeOperation)).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });

    const directoryPath = join(directory, "directory-target.json");
    await mkdir(directoryPath);
    expect(await createFileNativeTaskIntentStore(directoryPath).read(nativeOperation)).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });
  });

  test("times out against frozen and regressing wall clocks", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-monotonic-"));
    const originalDateNow = Date.now;
    const clocks = [
      () => 1_000,
      (() => {
        let current = 1_000;
        return () => (current -= 1);
      })(),
    ];
    for (const [index, clock] of clocks.entries()) {
      const path = join(directory, `intents-${index}.json`);
      const token = `018f5000-0000-4000-8000-00000000009${index}`;
      const ownerPath = `${path}.lock.${token}.owner`;
      await writeFile(
        ownerPath,
        `${JSON.stringify({
          incarnation: `018f5000-0000-4000-8000-00000000008${index}`,
          pid: process.pid,
          token,
        })}\n`,
      );
      await link(ownerPath, `${path}.lock`);
      Date.now = clock;
      const startedAt = performance.now();
      try {
        expect(
          await createFileNativeTaskIntentStore(path, {
            lockRetryMs: 5,
            lockTimeoutMs: 50,
          }).reserve(
            operation(),
            createNativeTaskExecutionIntent({
              authorityId: "fixture-authority",
              operation: operation(),
              payload: { command: "monotonic-timeout" },
            }),
          ),
        ).toEqual({
          ok: false,
          diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
        });
      } finally {
        Date.now = originalDateNow;
      }
      expect(performance.now() - startedAt).toBeLessThan(500);
    }
  });

  test("does not steal a lock from a live Node owner and reclaims it after exit", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-node-owner-"));
    const path = join(directory, "intents.json");
    const token = "018f5000-0000-4000-8000-000000000095";
    const incarnation = "018f5000-0000-4000-8000-000000000094";
    const ownerPath = `${path}.lock.${token}.owner`;
    const readyPath = join(directory, "node-owner.ready");
    const script = [
      'const { linkSync, writeFileSync } = require("node:fs")',
      "const [ownerPath, lockPath, readyPath, token, incarnation] = process.argv.slice(1)",
      "writeFileSync(ownerPath, JSON.stringify({ incarnation, pid: process.pid, token }))",
      "linkSync(ownerPath, lockPath)",
      'writeFileSync(readyPath, "ready")',
      "setTimeout(() => {}, 5_000)",
    ].join(";");
    const child = Bun.spawn(
      ["node", "-e", script, ownerPath, `${path}.lock`, readyPath, token, incarnation],
      { stderr: "pipe", stdout: "pipe" },
    );
    try {
      expect(await waitForFile(readyPath)).toBeTrue();
      const nativeOperation = operation();
      const intent = createNativeTaskExecutionIntent({
        authorityId: "fixture-authority",
        operation: nativeOperation,
        payload: { command: "node-live-owner" },
      });
      expect(
        await createFileNativeTaskIntentStore(path, {
          lockRetryMs: 5,
          lockTimeoutMs: 50,
        }).reserve(nativeOperation, intent),
      ).toEqual({
        ok: false,
        diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
      });

      child.kill();
      await child.exited;
      expect(
        await createFileNativeTaskIntentStore(path, {
          lockRetryMs: 5,
          lockTimeoutMs: 250,
        }).reserve(nativeOperation, intent),
      ).toEqual(expect.objectContaining({ ok: true }));
    } finally {
      child.kill();
      await child.exited;
    }
  });

  test("durably syncs every newly created directory entry before committing the document", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-native-intents-ancestry-"));
    const parent = join(directory, "first");
    const targetDirectory = join(parent, "second");
    const path = join(targetDirectory, "intents.json");
    const synced: string[] = [];
    const nativeOperation = operation();

    await createFileNativeTaskIntentStore(path, {
      directorySyncObserver: (syncedPath) => {
        synced.push(syncedPath);
      },
    }).reserve(
      nativeOperation,
      createNativeTaskExecutionIntent({
        authorityId: "fixture-authority",
        operation: nativeOperation,
        payload: { command: "sync-ancestry" },
      }),
    );

    const canonicalDirectory = await realpath(directory);
    expect(synced).toEqual([
      canonicalDirectory,
      join(canonicalDirectory, "first"),
      join(canonicalDirectory, "first", "second"),
    ]);
  });
});
