#!/bin/sh
# Starts the web server; imports the timetable in the background when there is none yet.
#   GTFS_IMPORT_ON_START=missing (default): import only when data/gtfs.sqlite does not exist
#                        always: import on every start (the old timetable serves meanwhile)
#                        demo:   build the invented demo timetable when there is none
#                        never:  do nothing (import yourself: node scripts/import-gtfs.mjs)
set -e
cd /app
DB="${GTFS_DB_PATH:-data/gtfs.sqlite}"
mkdir -p data "$(dirname "$DB")"

if ! touch data/.write-test 2>/dev/null; then
  echo "ERROR: /app/data is not writable for uid $(id -u). Fix the volume's ownership." >&2
  exit 1
fi
rm -f data/.write-test

case "${GTFS_IMPORT_ON_START:-missing}" in
  always)
    echo "Importing the timetable in the background…"
    node scripts/import-gtfs.mjs &
    ;;
  missing)
    if [ ! -f "$DB" ]; then
      echo "No timetable yet: importing in the background (the board says so until it is done)…"
      node scripts/import-gtfs.mjs &
    fi
    ;;
  demo)
    [ -f "$DB" ] || node scripts/make-demo-feed.mjs
    ;;
  never) ;;
  *)
    echo "Unknown GTFS_IMPORT_ON_START=${GTFS_IMPORT_ON_START}; expected missing, always, demo or never." >&2
    exit 1
    ;;
esac

exec node server.js
