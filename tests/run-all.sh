#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
ran=0

if [ -f "$root/web/package.json" ]; then
  echo "== web =="
  (cd "$root/web" && npm test && npm run e2e)
  ran=1
fi

if [ -f "$root/server/mvnw" ]; then
  echo "== server =="
  (cd "$root/server" && ./mvnw -q verify)
  ran=1
fi

if [ -f "$root/android/gradlew" ]; then
  echo "== android =="
  (cd "$root/android" && ./gradlew test)
  ran=1
fi

if [ "$ran" -eq 0 ]; then
  echo "No parts to test yet (web/, server/, android/ don't exist)."
else
  echo "All tests passed."
fi
