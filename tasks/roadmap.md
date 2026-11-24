# Tracepad roadmap: version 1

One task per agent session, in order. Each task file in `per-task/` has the goal, a prompt to paste into a new agent chat, a suggested model, the tests that must pass, and the spec sections it maps to. For every task, always write tests for the feature you're building, before or alongside the code. Then run `./tests/run-all.sh`; every test must pass. A task is done when its tests pass and the owner has checked it by hand and committed it.

Between phases, the owner checks the build by hand using `human-checkpoints.md`. Don't start the next phase until that checkpoint is signed off.

The previous single-table version, with schema tables per chunk, is in `roadmap-full.md`.

## Phase 0: setup

1. [Repo skeleton](per-task/01-repo-skeleton.md): folders from section 17, README, `.gitignore`, `.editorconfig`.
2. [Web scaffold](per-task/02-web-scaffold.md): Vite, React, TypeScript, Vitest, Playwright, one passing test.
3. [Domain types](per-task/03-domain-types.md): every data shape in `web/src/domain/types.ts`.

## Phase 1: web, fully offline

5. [Local database](per-task/05-local-database.md): IndexedDB through `idb`, with stores, indexes and upgrade steps.
6. [Create and edit](per-task/06-create-and-edit.md): device-made IDs, 5-second drafts, versions on leave or Ctrl+S.
7. [Saving dot](per-task/07-saving-dot.md): the saving indicator, and typing that never waits.
8. [Crash recovery](per-task/08-crash-recovery.md): a leftover draft becomes a version on open.
9. [Board](per-task/09-board.md): Keep-style grid or list, pinned first, sorts, Archive, Trash and Label views.
10. [Version history](per-task/10-version-history.md): timeline, read-only old versions, green and red compare.
11. [Trash](per-task/11-trash.md): trash, restore, undo, delete forever, 30-day cleanup.
12. [Pin, archive, color, labels](per-task/12-pin-archive-color-labels.md): history entries, except for color.
13. [Checklists](per-task/13-checklists.md): conversion, item edits, ticks as history entries.
14. [Search](per-task/14-search.md): local search, archived switch, search inside a label.
15. [Web reminders](per-task/15-reminders-web.md): timers while the tab is open, missed-reminder notices.
16. [Outbox](per-task/16-outbox.md): every change queues one row in the same transaction.
17. [Offline app shell](per-task/17-offline-shell.md): service worker and "Update ready" prompt.

## Phase 2: server, accounts, sync

18. [Server scaffold](per-task/18-server-scaffold.md): Spring Boot, Postgres, Flyway migration of the schema, Docker Compose.
19. [API contract](per-task/19-api-contract.md): `openapi.yaml` and shared push, pull and conflict fixtures.
20. [Auth](per-task/20-auth.md): register, login, refresh tokens, logout.
21. [Password reset and account delete](per-task/21-password-reset-and-account-delete.md): reset by email, soft delete.
22. [Push endpoint](per-task/22-push-endpoint.md): change log, duplicate-safe.
23. [Pull endpoint](per-task/23-pull-endpoint.md): bookmark, newer rows kept, tombstones.
24. [Web sync](per-task/24-web-sync.md): push, pull, backoff, status icon.
25. [Guest notes join](per-task/25-guest-notes-join.md): notes written signed-out join the account.
26. [Conflicts](per-task/26-conflicts.md): detection, badge, compare, pick a version.
27. [Draft sync](per-task/27-draft-sync.md): per-device drafts and "Laptop is editing".
28. [Purge job](per-task/28-purge-job.md): 30-day server purge, tombstones kept 60 days.
29. [Web Push reminders](per-task/29-web-push-reminders.md): server push as a backup when the tab is closed.

## Phase 3: Android

30. [Android scaffold](per-task/30-android-scaffold.md): Compose, Room, Retrofit generated from the contract.
31. [Android domain](per-task/31-android-domain.md): the domain rules in Kotlin, tested against the shared fixtures.
32. [Android board and editor](per-task/32-android-board-editor.md): board, editor, saving dot, history, trash.
33. [Android pin, labels, checklists, search](per-task/33-android-meta-search.md): note actions and `LIKE` search.
34. [Android sync](per-task/34-android-sync.md): login, WorkManager sync, conflicts, draft sync.
35. [Android reminders](per-task/35-android-reminders.md): exact alarms, boot receiver, permission.

## Done when

The web app and the Android app both pass every flow in sections 3 to 16 of `docs/Tracepad-Full-Flow.md` against the local server.
