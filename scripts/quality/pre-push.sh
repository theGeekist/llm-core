#!/usr/bin/env sh
set -eu

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
exec bun run quality:prepush
