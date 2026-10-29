#!/usr/bin/env sh
set -eu

# Local parity assumes pull requests target the repository's trunk, main.
# Git's pre-push hook cannot discover a pull request's selected base branch;
# GitHub Actions remains authoritative when a pull request targets another branch.
if ! remote_refs=$(git ls-remote --exit-code origin refs/heads/main 2>/dev/null); then
  echo "Cannot verify origin/main for the local quality baseline." >&2
  echo "Restore access to origin and retry; the pre-push gate will not fall back to HEAD." >&2
  exit 1
fi

remote_sha=$(printf '%s\n' "$remote_refs" | awk 'NR == 1 { print $1 }')

if [ -z "$remote_sha" ]; then
  echo "The origin remote does not advertise refs/heads/main; local CI parity cannot be verified." >&2
  exit 1
fi

if ! local_sha=$(git rev-parse --verify refs/remotes/origin/main^{commit} 2>/dev/null); then
  echo "The local origin/main tracking ref is unavailable." >&2
  echo "Run 'git fetch origin main' and retry the push." >&2
  exit 1
fi

if [ "$remote_sha" != "$local_sha" ]; then
  echo "Local origin/main is stale; local CI parity cannot be verified." >&2
  echo "Run 'git fetch origin main' and rerun the pre-push gate." >&2
  echo "Advertised remote main: $remote_sha" >&2
  echo "Fetched origin/main:    $local_sha" >&2
  exit 1
fi

printf '%s\n' "$local_sha"
