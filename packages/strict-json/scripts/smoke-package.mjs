import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "strict-json-smoke-"));
const packRoot = join(temporaryRoot, "pack");
const consumerRoot = join(temporaryRoot, "consumer");
const npmCache = join(temporaryRoot, "npm-cache");

try {
  await Promise.all([
    mkdir(packRoot, { recursive: true }),
    mkdir(consumerRoot, { recursive: true }),
  ]);

  const packed = await exec(
    "npm",
    ["pack", "--json", "--cache", npmCache, "--pack-destination", packRoot],
    { cwd: packageRoot },
  );
  const [{ filename }] = JSON.parse(packed.stdout);
  const tarball = join(packRoot, filename);

  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({ name: "strict-json-smoke", private: true, type: "module" }, null, 2)}\n`,
  );
  await writeFile(
    join(consumerRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ES2022",
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumerRoot, "consumer.ts"),
    [
      'import { snapshot, type FrozenJsonValue } from "@geekist/strict-json";',
      "const value: FrozenJsonValue = snapshot({ z: -0, a: [3, 2, 1] });",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(consumerRoot, "runtime.mjs"),
    [
      'import { canonicalize, snapshot } from "@geekist/strict-json";',
      "const value = snapshot({ z: -0, a: [3, 2, 1] });",
      'if (canonicalize(value) !== \'{"a":[3,2,1],"z":0}\') throw new Error("canonical mismatch");',
      "",
    ].join("\n"),
  );

  await exec(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--cache",
      npmCache,
      tarball,
    ],
    { cwd: consumerRoot },
  );

  await exec(join(workspaceRoot, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
    cwd: consumerRoot,
  });
  await exec("node", ["runtime.mjs"], { cwd: consumerRoot });

  const installedManifest = JSON.parse(
    await readFile(join(consumerRoot, "node_modules/@geekist/strict-json/package.json"), "utf8"),
  );
  if (installedManifest.name !== "@geekist/strict-json") {
    throw new Error("Packed package manifest was not installed.");
  }
  await access(
    join(consumerRoot, "node_modules/@geekist/strict-json/docs/internal/STRICT-JSON-CONTRACT.md"),
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
