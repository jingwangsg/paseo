#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <ssh-host-alias>" >&2
  exit 1
fi

REMOTE_ALIAS="$1"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
FLOW="$REPO_ROOT/packages/app/maestro/remote-workspace-parity.yaml"
FIXTURE_SCRIPT="$REPO_ROOT/packages/app/maestro/setup-remote-fixture.sh"
OUT_DIR="${PASEO_MAESTRO_OUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/paseo-remote-workspace-parity.XXXXXX")}"
PASEO_HOME="$OUT_DIR/paseo-home"
DAEMON_LOG="$OUT_DIR/daemon.log"
METRO_LOG="$OUT_DIR/metro.log"
MAESTRO_LOG="$OUT_DIR/maestro.log"
FIXTURE_LOG="$OUT_DIR/fixture.log"

mkdir -p "$OUT_DIR" "$PASEO_HOME"

DAEMON_PID=""
METRO_PID=""
SIMULATOR_ID=""

log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

cleanup() {
  local exit_code=$?
  set +e

  if [ -n "$METRO_PID" ]; then
    kill "$METRO_PID" >/dev/null 2>&1 || true
    wait "$METRO_PID" >/dev/null 2>&1 || true
  fi

  if [ -n "$DAEMON_PID" ]; then
    kill "$DAEMON_PID" >/dev/null 2>&1 || true
    wait "$DAEMON_PID" >/dev/null 2>&1 || true
  fi

  if [ -x "$FIXTURE_SCRIPT" ]; then
    "$FIXTURE_SCRIPT" cleanup "$REMOTE_ALIAS" >>"$FIXTURE_LOG" 2>&1 || true
  fi

  if [ "$exit_code" -ne 0 ] && [ -n "$SIMULATOR_ID" ]; then
    xcrun simctl io "$SIMULATOR_ID" screenshot "$OUT_DIR/failure-state.png" >/dev/null 2>&1 || true
  fi

  log "Artifacts: $OUT_DIR"
  exit "$exit_code"
}
trap cleanup EXIT

resolve_maestro_bin() {
  if command -v maestro >/dev/null 2>&1; then
    command -v maestro
    return
  fi

  for candidate in \
    "$HOME/.maestro/bin/maestro" \
    "/opt/homebrew/bin/maestro" \
    "/usr/local/bin/maestro"
  do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done

  return 1
}

pick_port() {
  node -e '
    const net = require("node:net");
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      process.stdout.write(String(address.port));
      server.close();
    });
  '
}

wait_for_http() {
  local url="$1"
  local timeout_secs="$2"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi

    if [ $(( $(date +%s) - started_at )) -ge "$timeout_secs" ]; then
      return 1
    fi
    sleep 1
  done
}

select_simulator() {
  local booted
  booted="$(xcrun simctl list devices booted available | sed -nE 's/^.*\(([0-9A-F-]+)\) \(Booted\)$/\1/p' | head -n1)"
  if [ -n "$booted" ]; then
    echo "$booted"
    return 0
  fi

  xcrun simctl list devices available \
    | sed -nE 's/^[[:space:]]+iPhone[^()]*\(([0-9A-F-]+)\) \([A-Za-z ]+\)$/\1/p' \
    | head -n1
}

if ! MAESTRO_BIN="$(resolve_maestro_bin)"; then
  echo "ERROR: Maestro CLI not found." >&2
  echo "Evidence: command -v maestro failed, and no executable was found at ~/.maestro/bin/maestro, /opt/homebrew/bin/maestro, or /usr/local/bin/maestro." >&2
  exit 1
fi

if ! xcrun simctl list devices available | grep -Eq 'iPhone|iPad'; then
  echo "ERROR: No iOS simulator devices are available." >&2
  echo "Evidence from 'xcrun simctl list devices available':" >&2
  xcrun simctl list devices available >&2
  exit 1
fi

SIMULATOR_ID="$(select_simulator)"
if [ -z "$SIMULATOR_ID" ]; then
  echo "ERROR: Failed to select an iOS simulator device." >&2
  echo "Evidence from 'xcrun simctl list devices available':" >&2
  xcrun simctl list devices available >&2
  exit 1
fi

log "Using simulator: $SIMULATOR_ID"
open -a Simulator >/dev/null 2>&1 || true
xcrun simctl boot "$SIMULATOR_ID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$SIMULATOR_ID" -b

log "Setting up remote fixture on $REMOTE_ALIAS"
FIXTURE_ENV="$("$FIXTURE_SCRIPT" setup "$REMOTE_ALIAS" 2>&1 | tee -a "$FIXTURE_LOG")"
eval "$FIXTURE_ENV"

DAEMON_PORT="$(pick_port)"
METRO_PORT="$(pick_port)"
while [ "$METRO_PORT" = "$DAEMON_PORT" ]; do
  METRO_PORT="$(pick_port)"
done

log "Starting daemon on 127.0.0.1:$DAEMON_PORT"
(
  cd "$REPO_ROOT"
  PASEO_HOME="$PASEO_HOME" \
    PASEO_LISTEN="127.0.0.1:$DAEMON_PORT" \
    PASEO_CORS_ORIGINS="*" \
    npm run dev:server
) >"$DAEMON_LOG" 2>&1 &
DAEMON_PID=$!

if ! wait_for_http "http://127.0.0.1:$DAEMON_PORT/api/status" 45; then
  echo "ERROR: Local daemon did not become ready within 45s." >&2
  echo "Evidence: curl http://127.0.0.1:$DAEMON_PORT/api/status never succeeded." >&2
  echo "See $DAEMON_LOG" >&2
  exit 1
fi

log "Starting Expo dev client Metro on 127.0.0.1:$METRO_PORT"
(
  cd "$REPO_ROOT/packages/app"
  BROWSER=none \
    CI=1 \
    APP_VARIANT=production \
    EXPO_PUBLIC_LOCAL_DAEMON="127.0.0.1:$DAEMON_PORT" \
    npx expo start --dev-client --localhost --port "$METRO_PORT" --non-interactive
) >"$METRO_LOG" 2>&1 &
METRO_PID=$!

if ! wait_for_http "http://127.0.0.1:$METRO_PORT" 60; then
  echo "ERROR: Expo Metro did not become ready within 60s." >&2
  echo "Evidence: curl http://127.0.0.1:$METRO_PORT never succeeded." >&2
  echo "See $METRO_LOG" >&2
  exit 1
fi

log "Running Maestro flow"
if (
  cd "$OUT_DIR"
  "$MAESTRO_BIN" test \
    -e REMOTE_ALIAS="$REMOTE_ALIAS" \
    -e REMOTE_CWD="$REMOTE_CWD" \
    -e REMOTE_BRANCH="$REMOTE_BRANCH" \
    -e REMOTE_PROJECT_NAME="$REMOTE_PROJECT_NAME" \
    "$FLOW"
) 2>&1 | tee "$MAESTRO_LOG"; then
  log "Remote workspace parity flow passed."
else
  echo "ERROR: Maestro flow failed." >&2
  echo "See $MAESTRO_LOG" >&2
  exit 1
fi
