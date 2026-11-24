#!/usr/bin/env bash
# Checks the repository skeleton from Flow §17 stays in place.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

for dir in contract contract/fixtures web server android docs learnings tasks tests; do
  [ -d "$dir" ] || fail "missing directory $dir"
done

for file in README.md .gitignore .editorconfig; do
  [ -f "$file" ] || fail "missing $file"
done

# An empty folder is kept with .gitkeep. Once a later task adds files, either is fine.
kept() {
  local dir="$1"
  if [ -f "$dir/.gitkeep" ]; then
    return 0
  fi
  if [ -n "$(find "$dir" -mindepth 1 -print -quit)" ]; then
    return 0
  fi
  fail "$dir is empty; add .gitkeep or the files that belong there"
}

kept contract/fixtures
kept web
kept server
kept android

grep -q 'npm run dev' README.md || fail "README.md should say how the web app runs (npm run dev)"
grep -q 'docker compose up' README.md || fail "README.md should say how the server runs (docker compose up)"
grep -q 'Android Studio' README.md || fail "README.md should say how the Android app runs (Android Studio)"

for pattern in node_modules target .gradle local.properties .idea; do
  grep -q -- "$pattern" .gitignore || fail ".gitignore is missing $pattern"
done

grep -q '^root = true' .editorconfig || fail ".editorconfig should set root = true"
grep -q '^\[\*\]' .editorconfig || fail ".editorconfig should apply one rule set to every file"
grep -q '^end_of_line = lf' .editorconfig || fail ".editorconfig should use lf line endings"
grep -q '^indent_style = space' .editorconfig || fail ".editorconfig should indent with spaces"
grep -q '^indent_size = 2' .editorconfig || fail ".editorconfig should use one indent size"

indent_count="$(grep -c '^indent_size' .editorconfig || true)"
[ "$indent_count" -eq 1 ] || fail ".editorconfig should set indent_size once, for every file"

echo "repo skeleton ok"
