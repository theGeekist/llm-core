#!/usr/bin/env sh
set -eu

node_version="$(tr -d '\r\n' < .nvmrc)"
if [ "$node_version" = "" ]; then
  echo "Pre-push requires a non-empty .nvmrc version declaration."
  exit 1
fi

if [ "$(node --version 2>/dev/null || true)" != "v$node_version" ]; then
  nvm_directory="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$nvm_directory/nvm.sh" ]; then
    echo "Pre-push requires Node v$node_version. Install it with: nvm install $node_version"
    exit 1
  fi
  # shellcheck disable=SC1090
  . "$nvm_directory/nvm.sh"
  if ! nvm use "$node_version" >/dev/null; then
    echo "Pre-push requires Node v$node_version. Install it with: nvm install $node_version"
    exit 1
  fi
fi

if [ "$(node --version)" != "v$node_version" ]; then
  echo "Pre-push activated the wrong Node version; expected v$node_version."
  exit 1
fi

exec "$@"
