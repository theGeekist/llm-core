import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const packageRoot = join(import.meta.dir, "..");
const distRoot = join(packageRoot, "dist");

const clean = async (): Promise<void> => {
  await rm(distRoot, { force: true, recursive: true });
};

const emit = async (): Promise<void> => {
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
    readonly dependencies?: Readonly<Record<string, string>>;
  };
  await mkdir(join(distRoot, "esm"), { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(packageRoot, "index.ts")],
    external: Object.keys(packageJson.dependencies ?? {}),
    format: "esm",
    minify: false,
    outdir: join(distRoot, "esm"),
    packages: "external",
    sourcemap: "external",
    splitting: false,
    target: "browser",
  });
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error("Strict-json ESM build failed.");
  }
};

switch (process.argv[2]) {
  case "clean":
    await clean();
    break;
  case "emit":
    await emit();
    break;
  default:
    throw new TypeError("Expected strict-json build action: clean or emit.");
}
