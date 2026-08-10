import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { npmDistTag, validateReleaseVersion } from "./release-version";

const roots: string[] = [];

const fixture = (version = "2.0.0", changelog = "## [Unreleased]\n\nTarget version: 2.0.0.\n") => {
  const root = mkdtempSync(join(tmpdir(), "release-version-"));
  roots.push(root);
  const packageRoot = join(root, "packages/llm-core");
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ name: "@aifsd/llm-core", version, private: false })}\n`,
  );
  writeFileSync(join(packageRoot, "CHANGELOG.md"), changelog);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release version contract", () => {
  test("accepts the declared unreleased target during preparation", () => {
    expect(
      validateReleaseVersion(fixture(), {
        packageKey: "llm-core",
        allowUnreleased: true,
      }),
    ).toEqual([]);
  });

  test("requires an exact matching tag and dated changelog before publication", () => {
    const root = fixture("2.0.0", "## [2.0.0] - 2026-08-09\n");
    expect(
      validateReleaseVersion(root, {
        packageKey: "llm-core",
        tag: "v2.0.0",
        allowUnreleased: false,
      }),
    ).toEqual([]);
    expect(
      validateReleaseVersion(root, {
        packageKey: "llm-core",
        tag: "v2.0.1",
        allowUnreleased: false,
      }).join("\n"),
    ).toContain("must exactly match v2.0.0");
  });

  test("rejects malformed versions and calendar dates", () => {
    expect(
      validateReleaseVersion(fixture("v2", "## [v2] - 2026-02-31\n"), {
        packageKey: "llm-core",
        tag: "vv2",
        allowUnreleased: false,
      }).join("\n"),
    ).toContain("exact semantic version");
    expect(
      validateReleaseVersion(fixture("2.0.0", "## [2.0.0] - 2026-02-31\n"), {
        packageKey: "llm-core",
        tag: "v2.0.0",
        allowUnreleased: false,
      }).join("\n"),
    ).toContain("dated 2.0.0 release heading");
  });

  test("derives and enforces explicit stable and prerelease npm tags", () => {
    expect(npmDistTag("2.0.0")).toBe("latest");
    expect(npmDistTag("2.1.0-rc.1")).toBe("next");
    const root = fixture("2.1.0-rc.1", "## [2.1.0-rc.1] - 2026-08-10\n");
    expect(
      validateReleaseVersion(root, {
        packageKey: "llm-core",
        tag: "v2.1.0-rc.1",
        distTag: "latest",
        allowUnreleased: false,
      }).join("\n"),
    ).toContain("must be next");
  });

  test("accepts the AIFSD package key and tag family", () => {
    const root = mkdtempSync(join(tmpdir(), "release-version-aifsd-"));
    roots.push(root);
    const packageRoot = join(root, "packages/aifsd");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify({ name: "@aifsd/sdk", version: "0.1.0", private: false })}\n`,
    );
    writeFileSync(join(packageRoot, "CHANGELOG.md"), "## [0.1.0] - 2026-08-10\n");
    expect(
      validateReleaseVersion(root, {
        packageKey: "aifsd",
        tag: "aifsd-v0.1.0",
        allowUnreleased: false,
      }),
    ).toEqual([]);
  });
});
