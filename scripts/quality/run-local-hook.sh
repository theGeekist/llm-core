#!/usr/bin/env sh
set -eu

hook=${1:-}
root=$(git rev-parse --show-toplevel)
cd "$root"

if ! command -v bun >/dev/null 2>&1 && [ -x "$HOME/.bun/bin/bun" ]; then
  PATH="$HOME/.bun/bin:$PATH"
  export PATH
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Git hooks require Bun $(tr -d '\r\n' < .bun-version), but bun was not found on PATH." >&2
  echo "Install Bun or add its bin directory to PATH, then retry." >&2
  exit 127
fi

expected_bun=$(tr -d '\r\n' < .bun-version)
actual_bun=$(bun --version 2>/dev/null || true)
if [ "$actual_bun" != "$expected_bun" ]; then
  echo "Git hooks require Bun $expected_bun; found ${actual_bun:-an unusable Bun installation}." >&2
  echo "Install the repository-pinned version and retry." >&2
  exit 1
fi

temp_dir=${TMPDIR:-/tmp}
if ! temp_file=$(mktemp "$temp_dir/llm-core-hook.XXXXXX" 2>/dev/null); then
  echo "Git hooks cannot write temporary files in '$temp_dir'. Set TMPDIR to a writable directory and retry." >&2
  exit 1
fi
rm -f "$temp_file"

case "$hook" in
  pre-commit)
    required_commands="lint-staged prettier eslint"
    run_command="bun run lint:staged"
    ;;
  pre-push)
    required_commands="turbo prettier eslint tsc"
    run_command="bun run quality:prepush:hook"
    ;;
  *)
    echo "Usage: $0 pre-commit|pre-push" >&2
    exit 2
    ;;
esac

missing_commands=
for command_name in $required_commands; do
  if [ ! -x "node_modules/.bin/$command_name" ]; then
    missing_commands="$missing_commands $command_name"
  fi
done
if [ -n "$missing_commands" ]; then
  echo "Git hook dependencies are missing:$missing_commands" >&2
  echo "Run 'bun install --frozen-lockfile' from the repository root, then retry." >&2
  exit 127
fi

exec sh -c "$run_command"
