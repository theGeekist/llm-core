#!/usr/bin/env sh
set -eu

# Keep this worktree selected, but do not leak hook-local Git state into fixture repositories.
cd "$(git rev-parse --show-toplevel)"
for git_local_variable in $(git rev-parse --local-env-vars); do
  unset "$git_local_variable"
done

if git status --porcelain=v1 -z --untracked-files=all | grep -q .; then
  echo "Pre-push auto-fix requires a clean worktree."
  echo "Commit, stash, or remove staged, unstaged, and non-ignored untracked files, then retry the push."
  exit 1
fi

echo "Running local formatter and ESLint auto-fix before the CI quality boundary."
fix_status=0
bun run quality:prepush:fix || fix_status=$?

if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
  echo "Pre-push auto-fix changed tracked files. The push was blocked."
  echo "Review the changes, stage them deliberately, commit again, then retry the push."
  exit 1
fi

if [ "$fix_status" -ne 0 ]; then
  echo "Pre-push formatter or lint auto-fix failed. The push was blocked."
  exit "$fix_status"
fi

echo "Running the CI quality boundary. This includes the sealed ESLint baseline and may take a few minutes."
quality_base_sha=$(sh scripts/quality/check-quality-base.sh)
echo "Using verified origin/main $quality_base_sha as QUALITY_BASE_SHA."
env QUALITY_BASE_SHA="$quality_base_sha" bun run quality:prepush

latest_quality_base_sha=$(sh scripts/quality/check-quality-base.sh)
if [ "$latest_quality_base_sha" != "$quality_base_sha" ]; then
  echo "origin/main advanced while the local quality gate was running; the push was blocked." >&2
  echo "Fetch origin/main and rerun the pre-push gate." >&2
  exit 1
fi
