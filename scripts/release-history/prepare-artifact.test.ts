import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalInventory, prepareArtifact } from "./prepare-artifact";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release artifact preparation", () => {
  test("canonicalises inventory independently of npm file order", () => {
    expect(
      canonicalInventory([
        { path: "package/z.js", size: 2 },
        { path: "package/a.js", size: 1 },
      ]),
    ).toBe("package/a.js\u00001\npackage/z.js\u00002\n");
  });

  test("packs once and records exact archive and inventory digests", () => {
    const root = mkdtempSync(join(tmpdir(), "release-artifact-"));
    roots.push(root);
    const packageRoot = join(root, "package");
    const outputRoot = join(root, "output");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify({ name: "artifact-fixture", version: "1.2.3", files: ["index.js"] })}\n`,
    );
    writeFileSync(join(packageRoot, "index.js"), "export const answer = 42;\n");

    const metadata = prepareArtifact(packageRoot, outputRoot);

    expect(metadata.package).toBe("artifact-fixture");
    expect(metadata.version).toBe("1.2.3");
    expect(metadata.sha512).toMatch(/^sha512:[0-9a-f]{128}$/);
    expect(metadata.integrity).toStartWith("sha512-");
    expect(metadata.inventory).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(metadata.files.map(({ path }) => path)).toEqual(["index.js", "package.json"]);
  });
});
