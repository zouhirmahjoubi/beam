#!/usr/bin/env bash
# Dev-only: start the headless emulator runtime for the check scripts, retrying
# the occasional Windows start-up failure. Prints READY or FAILED.
cd "$(dirname "$0")/.."
for attempt in 1 2 3; do
  npx @iwsdk/cli dev down > /dev/null 2>&1
  rm -f .iwsdk/runtime/session.json.lock.prepared-* 2>/dev/null
  (npx @iwsdk/cli dev up --headless --foreground --allow-browser-automation --timeout 170000 > /tmp/devup.txt 2>&1 &)
  for i in $(seq 1 45); do
    if npx @iwsdk/cli dev status 2>&1 | grep -q '"browserCommandReady": true'; then echo READY; exit 0; fi
    if grep -q '"dev_up_exit"' /tmp/devup.txt 2>/dev/null; then break; fi
    sleep 5
  done
  echo "start attempt $attempt failed: $(grep -o 'RuntimeOwnerError[^.]*' /tmp/devup.txt | head -1)" >&2
done
echo FAILED
exit 1
