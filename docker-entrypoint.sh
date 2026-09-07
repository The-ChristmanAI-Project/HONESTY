#!/bin/bash
# One watch, not two products. If either half dies, the container dies with it —
# a half-running Honesty that still answers the health check would be the exact
# dishonesty this program exists to catch.
set -euo pipefail

shutdown() {
  trap - INT TERM
  kill 0 2>/dev/null || true
}
trap shutdown INT TERM

python3 -u /app/honesty-local/honesty.py &
local_pid=$!

node /app/.output/server/index.mjs &
desk_pid=$!

echo "[honesty] Honesty Local pid ${local_pid} on ${HONESTY_LOCAL_HOST}:${HONESTY_LOCAL_PORT}" >&2
echo "[honesty] desk pid ${desk_pid} on ${NITRO_HOST}:${NITRO_PORT}" >&2

set +e
wait -n "${local_pid}" "${desk_pid}"
status=$?
set -e

if ! kill -0 "${local_pid}" 2>/dev/null; then
  echo "[honesty] Honesty Local exited (${status}). Taking the desk down with it." >&2
else
  echo "[honesty] the desk exited (${status}). Taking Honesty Local down with it." >&2
fi

shutdown
exit "${status}"
