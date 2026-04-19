#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <setup|cleanup> <ssh-host-alias>" >&2
  exit 1
fi

COMMAND="$1"
REMOTE_ALIAS="$2"
REMOTE_FIXTURE_ROOT="/tmp/paseo-remote-workspace-parity"
REMOTE_BRANCH="remote-parity"
REMOTE_README_TEXT="Remote parity fixture for Paseo Maestro."

run_remote() {
  ssh "$REMOTE_ALIAS" "$@"
}

case "$COMMAND" in
  setup)
    run_remote /bin/sh <<EOF
set -eu
rm -rf "$REMOTE_FIXTURE_ROOT"
mkdir -p "$REMOTE_FIXTURE_ROOT"
cd "$REMOTE_FIXTURE_ROOT"
git init -b "$REMOTE_BRANCH" >/dev/null
git config user.name "Paseo Maestro"
git config user.email "maestro@getpaseo.test"
cat > README.md <<'README'
$REMOTE_README_TEXT
README
mkdir -p src
cat > src/index.ts <<'TS'
export const fixture = "remote-workspace-parity";
TS
git add README.md src/index.ts
git commit -m "Initial remote parity fixture" >/dev/null
EOF
    printf 'REMOTE_CWD=%q\n' "$REMOTE_FIXTURE_ROOT"
    printf 'REMOTE_BRANCH=%q\n' "$REMOTE_BRANCH"
    printf 'REMOTE_PROJECT_NAME=%q\n' "$(basename "$REMOTE_FIXTURE_ROOT")"
    ;;
  cleanup)
    run_remote /bin/sh <<EOF
set -eu
rm -rf "$REMOTE_FIXTURE_ROOT"
EOF
    ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    exit 1
    ;;
esac
