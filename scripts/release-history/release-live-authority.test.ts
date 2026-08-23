import { describe, expect, test } from "bun:test";
import { validateLiveReleaseAuthority } from "./release-live-authority";

const sha = "a".repeat(40);
const fetchJson = async (path: string): Promise<Readonly<Record<string, unknown>>> => {
  if (path.startsWith("/git/ref/tags/")) return { object: { type: "commit", sha } };
  return { status: "ahead" };
};

describe("live release authority", () => {
  test("accepts an exact live tag whose commit is contained in main", async () => {
    await expect(
      validateLiveReleaseAuthority({ tag: "v2.0.0", head: sha, workflowSha: sha, fetchJson }),
    ).resolves.toBeUndefined();
  });

  test("rejects moved or deleted tags and off-main commits", async () => {
    await expect(
      validateLiveReleaseAuthority({
        tag: "v2.0.0",
        head: sha,
        workflowSha: sha,
        fetchJson: async () => ({ object: { type: "commit", sha: "b".repeat(40) } }),
      }),
    ).rejects.toThrow("does not resolve");
    await expect(
      validateLiveReleaseAuthority({
        tag: "v2.0.0",
        head: sha,
        workflowSha: sha,
        fetchJson: async () => {
          throw new Error("404");
        },
      }),
    ).rejects.toThrow("404");
    await expect(
      validateLiveReleaseAuthority({
        tag: "v2.0.0",
        head: sha,
        workflowSha: sha,
        fetchJson: async (path) =>
          path.startsWith("/git/ref/")
            ? { object: { type: "commit", sha } }
            : { status: "diverged" },
      }),
    ).rejects.toThrow("not contained");
  });
});
