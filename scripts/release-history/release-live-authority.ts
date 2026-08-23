import { type SpawnSyncOptions, spawnSync } from "node:child_process";

type JsonRecord = Readonly<Record<string, unknown>>;

interface LiveReleaseAuthorityInput {
  readonly tag: string;
  readonly head: string;
  readonly workflowSha: string;
  readonly fetchJson: (path: string) => Promise<JsonRecord>;
}

const record = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as JsonRecord;
};

export const validateLiveReleaseAuthority = async ({
  tag,
  head,
  workflowSha,
  fetchJson,
}: LiveReleaseAuthorityInput): Promise<void> => {
  if (!/^[0-9a-f]{40}$/.test(head) || head !== workflowSha) {
    throw new Error("Checked-out release commit differs from GITHUB_SHA");
  }
  let object = record((await fetchJson(`/git/ref/tags/${encodeURIComponent(tag)}`)).object, "tag");
  for (let depth = 0; object.type === "tag" && depth < 5; depth += 1) {
    object = record((await fetchJson(`/git/tags/${String(object.sha)}`)).object, "tag target");
  }
  if (object.type !== "commit" || object.sha !== head) {
    throw new Error("Live release tag does not resolve to the checked-out release commit");
  }
  const comparison = await fetchJson(`/compare/${head}...main`);
  if (comparison.status !== "ahead" && comparison.status !== "identical") {
    throw new Error("Release commit is not contained in live main");
  }
};

const command = (arguments_: readonly string[], options?: SpawnSyncOptions): string => {
  const result = spawnSync(arguments_[0]!, arguments_.slice(1), {
    ...options,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || arguments_.join(" "));
  return result.stdout.trim();
};

export const assertLiveReleaseAuthority = async (root: string, tag: string): Promise<void> => {
  const repository = process.env.GITHUB_REPOSITORY;
  const workflowSha = process.env.GITHUB_SHA;
  if (!repository || !workflowSha) throw new Error("GitHub release identity is unavailable");
  const head = command(["git", "rev-parse", "HEAD"], { cwd: root });
  await validateLiveReleaseAuthority({
    tag,
    head,
    workflowSha,
    fetchJson: async (path) =>
      JSON.parse(command(["gh", "api", `repos/${repository}${path}`], { cwd: root })) as JsonRecord,
  });
};
