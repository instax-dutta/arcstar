#!/bin/sh
# Gentle local test runner.
#
# The default `pnpm test` fans out across turbo and vitest workers, which will
# saturate every core. The suites here are small enough that a single nice'd
# process finishes in seconds, so this trades wall-clock for not disturbing
# whatever else is running on the machine.
#
#   ./scripts/gentle-test.sh              # every package, sequential, low priority
#   ./scripts/gentle-test.sh graph        # one package only
#
# CI is unaffected and still runs at full parallelism.

set -e
cd "$(dirname "$0")/.."

# Nice 19 = lowest possible priority. The kernel will always prefer anything else
# running, so a foreground app stays responsive even while this runs.
NICE=19
HEAP="${ARCSTAR_TEST_HEAP:-512}"

run() {
  echo "==> $1 (nice $NICE, heap ${HEAP}m)"
  # shellcheck disable=SC2086
  nice -n $NICE env NODE_OPTIONS="--max-old-space-size=$HEAP" \
    pnpm --filter "@arcstar/$1" test
}

if [ -n "$1" ]; then
  run "$1"
else
  for pkg in contracts credibility graph; do
    run "$pkg"
  done
fi
