import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import * as configuration from "../../src/config/index.js";

describe("configuration public front", () => {
  beforeAll(() => {
    const packageRoot = resolve(import.meta.dir, "../..");
    const strictJsonRoot = resolve(packageRoot, "../strict-json");
    const kernelRoot = resolve(packageRoot, "../llm-core");
    const strictJsonBuild = spawnSync(process.execPath, ["run", "build"], {
      cwd: strictJsonRoot,
      encoding: "utf8",
    });
    expect(strictJsonBuild.status).toBe(0);
    const kernelBuild = spawnSync(process.execPath, ["run", "build"], {
      cwd: kernelRoot,
      encoding: "utf8",
    });
    expect(kernelBuild.status).toBe(0);
    const build = spawnSync(process.execPath, ["run", "build"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(build.status).toBe(0);
  }, 90_000);

  test("publishes descriptive configuration operations from one front", () => {
    expect(Object.keys(configuration).sort()).toEqual([
      "applyPlan",
      "createConfigurationLock",
      "explainConfiguration",
      "planChanges",
      "resolveManifest",
      "validateManifest",
    ]);
  });

  test("is consumable through the published package subpath", async () => {
    const packageSubpath: string = "@aifsd/sdk/config";
    const isolatedConsumer = await import(packageSubpath);
    expect(Object.keys(isolatedConsumer).sort()).toEqual(Object.keys(configuration).sort());
  });

  test("loads the package export from an isolated workspace consumer", () => {
    const workspaceRoot = resolve(import.meta.dir, "../../../..");
    const script = [
      'import * as config from "@aifsd/sdk/config";',
      "console.log(JSON.stringify(Object.keys(config).sort()));",
    ].join("");
    const nodeExecutable = Bun.which("node");
    expect(nodeExecutable).not.toBeNull();
    if (nodeExecutable === null) {
      throw new Error("Node executable is required for the package smoke test");
    }
    const execution = spawnSync(nodeExecutable, ["--input-type=module", "--eval", script], {
      cwd: workspaceRoot,
      encoding: "utf8",
    });

    expect(execution.status).toBe(0);
    expect(execution.stderr).toBe("");
    expect(JSON.parse(execution.stdout)).toEqual(Object.keys(configuration).sort());
  });

  test("supplies runtime and declarations to a clean packed NodeNext consumer", () => {
    const workspaceRoot = resolve(import.meta.dir, "../../../..");
    const packageRoot = resolve(import.meta.dir, "../..");
    const strictJsonRoot = resolve(packageRoot, "../strict-json");
    const kernelRoot = resolve(packageRoot, "../llm-core");
    const pipelineRoot = resolve(workspaceRoot, "node_modules/@wpkernel/pipeline");
    const smokeRoot = mkdtempSync(join(tmpdir(), "aifsd-packed-"));
    const packRoot = join(smokeRoot, "pack");
    const consumerRoot = join(smokeRoot, "consumer");
    const npmCache = join(smokeRoot, "npm-cache");
    try {
      mkdirSync(packRoot, { recursive: true });
      mkdirSync(consumerRoot, { recursive: true });
      const npmExecutable = Bun.which("npm");
      const nodeExecutable = Bun.which("node");
      expect(npmExecutable).not.toBeNull();
      expect(nodeExecutable).not.toBeNull();
      if (npmExecutable === null || nodeExecutable === null) {
        throw new Error("npm and Node are required for the packed package smoke test");
      }
      const pack = (root: string) => {
        const result = spawnSync(
          npmExecutable,
          ["pack", "--json", "--pack-destination", packRoot],
          { cwd: root, encoding: "utf8", env: { ...process.env, npm_config_cache: npmCache } },
        );
        expect(result.status).toBe(0);
        const [manifest] = JSON.parse(result.stdout) as Array<{
          filename: string;
          files: Array<{ path: string }>;
        }>;
        return { manifest, tarball: join(packRoot, manifest!.filename) };
      };
      const strictJson = pack(strictJsonRoot);
      const kernel = pack(kernelRoot);
      const pipeline = pack(pipelineRoot);
      const sdk = pack(packageRoot);
      const packedPaths = sdk.manifest!.files.map(({ path }) => path);
      expect(
        packedPaths.every(
          (path) =>
            path === "package.json" ||
            path === "README.md" ||
            path === "CHANGELOG.md" ||
            path.startsWith("dist/"),
        ),
      ).toBe(true);
      expect(
        packedPaths.some((path) =>
          /(?:^|\/)(?:catalog-entry|catalog-validation|closed-object|explain|materialization-plan|materialize|maybe|portable-data|resolver-correspondence|types)\.d\.ts$/.test(
            path,
          ),
        ),
      ).toBe(false);
      writeFileSync(
        join(consumerRoot, "package.json"),
        `${JSON.stringify({
          name: "aifsd-packed-consumer",
          private: true,
          type: "module",
          dependencies: {
            "@aifsd/sdk": `file:${sdk.tarball}`,
            "@aifsd/llm-core": `file:${kernel.tarball}`,
            "@aifsd/strict-json": `file:${strictJson.tarball}`,
            "@wpkernel/pipeline": `file:${pipeline.tarball}`,
          },
        })}\n`,
      );
      const install = spawnSync(
        npmExecutable,
        [
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--no-package-lock",
          "--omit=optional",
          "--offline",
        ],
        {
          cwd: consumerRoot,
          encoding: "utf8",
          env: { ...process.env, npm_config_cache: npmCache },
        },
      );
      expect(install.status).toBe(0);
      const runtime = spawnSync(
        nodeExecutable,
        [
          "--input-type=module",
          "--eval",
          'import("@aifsd/sdk/config").then((value) => console.log(Object.keys(value).length))',
        ],
        { cwd: consumerRoot, encoding: "utf8" },
      );
      expect(runtime.status).toBe(0);
      expect(runtime.stdout.trim()).toBe("6");
      writeFileSync(
        join(consumerRoot, "tsconfig.json"),
        `${JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            skipLibCheck: false,
            types: [],
          },
          include: ["consumer.ts"],
        })}\n`,
      );
      writeFileSync(
        join(consumerRoot, "consumer.ts"),
        [
          'import { validateManifest, type Manifest } from "@aifsd/sdk/config";',
          "const result = validateManifest({});",
          "const manifest: Manifest | undefined = result.ok ? result.value : undefined;",
          "void manifest;",
          "",
        ].join("\n"),
      );
      const execution = spawnSync(
        resolve(workspaceRoot, "node_modules/.bin/tsc"),
        ["-p", "tsconfig.json"],
        { cwd: consumerRoot, encoding: "utf8" },
      );
      if (execution.status !== 0) {
        throw new Error(
          `Packed consumer typecheck failed:\n${execution.stdout}${execution.stderr}`,
        );
      }
      expect(execution.status).toBe(0);
      expect(execution.stderr).toBe("");
    } finally {
      rmSync(smokeRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
