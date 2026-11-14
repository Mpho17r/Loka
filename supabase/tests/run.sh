#!/usr/bin/env bash
# Runs the migrations and SQL tests on a throwaway local Postgres (no Supabase needed).
# Usage: supabase/tests/run.sh   (needs Postgres 15+ binaries; set PGBIN if they are not on PATH.
# Postgres refuses to run as root, so as root this script re-runs itself as the "postgres" user.)
set -euo pipefail
if [ "$(id -u)" = "0" ]; then
  SRC="$(mktemp -d)"; cp -r "$(cd "$(dirname "$0")/.." && pwd)" "$SRC/supabase"; chmod -R a+rX "$SRC"; chmod a+rx "$SRC"
  exec su postgres -s /bin/bash -c "'$SRC/supabase/tests/run.sh'"
fi
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT:-54329}"
trap '"$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA" -l "$DATA/log" -w start >/dev/null
PSQL=("$PGBIN/psql" -h "$DATA" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -c 'create database loka_test'
PSQL+=(-d loka_test)
"${PSQL[@]}" -f "$HERE/tests/00_supabase_shim.sql"
for f in "$HERE"/migrations/*.sql; do echo "applying $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$HERE/seed.sql"

OUT="$DATA/test.out"
if "${PSQL[@]}" -f "$HERE/tests/promote_test.sql" >"$OUT" 2>&1; then
  grep -E 'PASS' "$OUT" | sed 's/^psql:[^ ]* NOTICE:  //' 
  echo "---"; echo "passed: $(grep -c PASS "$OUT")"; echo "ALL TESTS PASSED"
else
  grep -E 'PASS' "$OUT" | sed 's/^psql:[^ ]* NOTICE:  //' | tail -5
  grep -E 'FAIL|ERROR|DETAIL|CONTEXT|LINE' "$OUT" | head -20; exit 1
fi
