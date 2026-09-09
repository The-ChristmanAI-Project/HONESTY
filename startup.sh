#!/bin/sh
# Revive. Honesty Local on 8787, desk on 8788. 8080 is never the option.
set -eu
cd "$(dirname "$0")"

LOG=./app-startup.log
LOCAL_LOG=./honesty-local/honesty-local.log
DESK_URL=http://127.0.0.1:8788/
LOCAL_URL=http://127.0.0.1:8787/api/status

# Any HTTP response means the port is held. -f would misread a 404 as down.
up() {
  curl -s -o /dev/null --max-time 2 "$1"
}

if ! up "$LOCAL_URL"; then
  HONESTY_NO_BROWSER=1 python3 honesty-local/honesty.py --no-browser >>"$LOCAL_LOG" 2>&1 &
  LOCAL_PID=$!
  i=0
  while ! up "$LOCAL_URL"; do
    if ! kill -0 "$LOCAL_PID" 2>/dev/null; then
      echo "Honesty Local exited during startup; see $LOCAL_LOG" >&2
      exit 1
    fi
    i=$((i + 1))
    if [ "$i" -ge 20 ]; then
      echo "Honesty Local did not answer on 8787 within 20s; see $LOCAL_LOG" >&2
      kill "$LOCAL_PID" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done
  echo "Honesty Local up on 8787 (pid $LOCAL_PID)"
else
  echo "Honesty Local already up on 8787"
fi

# Nothing to stop is a normal outcome here, so its exit status is ignored.
node scripts/preview.mjs stop >/dev/null 2>&1 || true

# Probed twice, a second apart. A socket mid-shutdown still answers once.
if up "$DESK_URL" && sleep 1 && up "$DESK_URL"; then
  echo "Desk already up on 8788"
  exit 0
fi

npm run dev >>"$LOG" 2>&1 </dev/null &
DEV_PID=$!

i=0
while ! up "$DESK_URL"; do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "npm run dev exited during startup; see $LOG" >&2
    exit 1
  fi
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "Desk did not answer on 8788 within 60s; see $LOG" >&2
    kill "$DEV_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo "Desk up on 8788 (pid $DEV_PID)"
exit 0
