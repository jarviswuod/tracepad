# Tracepad roadmap: version 1

One chunk per session, in order. Each chunk follows the version 1 plan in section 19 of `docs/Tracepad-Full-Flow.md` (the "Flow" column below) and is done when its tests pass with `./tests/run-all.sh` and the owner has checked it by hand and committed it. "Schema" names the tables from `docs/Tracepad-Schema.md` that the chunk touches.

Status: `[ ]` not started, `[~]` in progress, `[x]` done.

## Phase 0: setup

| #   | Status | Chunk                                                                                                                       | Flow     | Schema                 |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- |
| 1   | [ ]    | Repo skeleton: the folders from section 17, `README.md`, `.gitignore`, `.editorconfig`                                      | 17       | —                      |
| 2   | [ ]    | `web/` with Vite, React, TypeScript, Vitest, `fake-indexeddb` and Playwright, plus one passing test                         | 1, 17    | —                      |
| 3   | [ ]    | `web/src/domain/types.ts`: every data shape, written once                                                                   | 17       | All tables             |

## Phase 1: web, fully offline

| #   | Status | Chunk                                                                                                                            | Flow       | Schema                                         |
| --- | ------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------- |
| 5   | [ ]    | Local database module with `idb`: stores, indexes, upgrade steps                                                                 | 3, 17      | Device copies, `outbox`, `local_sync_state`    |
| 6   | [ ]    | Create and edit: device-made IDs, 5-second draft, a version on leaving or Ctrl+S, the empty-note and unchanged rules             | 7, 8       | `notes`, `note_versions`, `drafts`             |
| 7   | [ ]    | The saving dot, and typing that never waits on anything                                                                          | 8          | `drafts`                                       |
| 8   | [ ]    | Crash recovery: a leftover draft becomes a version on open                                                                       | 3, 8       | `drafts`, `note_versions`                      |
| 9   | [ ]    | Board UI like Google Keep: grid or list, "Take a note" bar, side list; pinned first, two sort orders, Archive, Trash, Label views | 6          | `notes`, `note_labels`                         |
| 10  | [ ]    | Version history: timeline, green and red compare (jsdiff), open an old version read-only                                         | 9          | `note_versions`, `history_events`              |
| 11  | [ ]    | Trash: move to trash, restore, undo, delete forever, empty the trash, 30-day cleanup                                             | 16         | `notes`, `history_events`                      |
| 12  | [ ]    | Pin, archive and labels with history entries; color with no history entry                                                        | 10         | `notes`, `labels`, `note_labels`, `history_events` |
| 13  | [ ]    | Checklists, with tick history entries                                                                                            | 11         | `note_versions`, `checklist_ticks`, `history_events` |
| 14  | [ ]    | Search: title, body and checklist items; archived switch; search inside one label                                                | 12         | `notes`, `note_versions`, `note_labels`        |
| 15  | [ ]    | Reminders while the tab is open, and missed-reminder notices                                                                     | 13         | `reminders`, `history_events`                  |
| 16  | [ ]    | The outbox: confirm every change from chunks 6 to 15 queues a row in the same transaction                                        | 14         | `outbox`                                       |
| 17  | [ ]    | Offline app shell: the service worker and the "Update ready" prompt                                                              | 3          | —                                              |

## Phase 2: server, accounts, sync

| #   | Status | Chunk                                                                                               | Flow   | Schema                                                       |
| --- | ------ | --------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| 18  | [ ]    | `server/` with Spring Boot, Postgres, Flyway and Testcontainers, plus `docker-compose.yml`           | 1, 17  | Flyway `V1__init.sql` from the schema                        |
| 19  | [ ]    | `contract/openapi.yaml` and fixtures for push and pull                                              | 14, 17 | `change_log`                                                 |
| 20  | [ ]    | Register, login, refresh tokens, logout                                                             | 4, 5   | `users`, `devices`, `refresh_tokens`                         |
| 21  | [ ]    | Forgot password through Mailpit; delete account as a soft delete                                    | 5      | `password_reset_tokens`, `users`                             |
| 22  | [ ]    | The push endpoint: change log, duplicate-safe                                                       | 14     | `change_log`                                                 |
| 23  | [ ]    | The pull endpoint: newer rows kept even before the bookmark, tombstones, the bookmark still advances | 14, 16 | `change_log`, `sync_state`, `tombstones`                     |
| 24  | [ ]    | Web sync: push, pull, bookmark, backoff, status icon                                                | 6, 14  | `outbox`, `local_sync_state`                                 |
| 25  | [ ]    | Guest notes join an account at first sign-in                                                        | 4, 5   | `outbox`, `local_sync_state`                                 |
| 26  | [ ]    | Conflicts: detection, badge, compare screen, picking a version                                      | 15     | `conflicts`, `note_versions`                                 |
| 27  | [ ]    | Draft sync: per-device drafts and the "Laptop is editing" view                                      | 8      | `drafts`, `devices`                                          |
| 28  | [ ]    | Server purge job: 30 days, tombstones                                                               | 16     | `notes`, `tombstones`                                        |
| 29  | [ ]    | Web Push reminders with the tab closed                                                              | 13     | `reminders`, `web_push_subscriptions`                        |

## Phase 3: Android

| #   | Status | Chunk                                                                                       | Flow          | Schema                                   |
| --- | ------ | ------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------- |
| 30  | [ ]    | `android/` project with Compose, Room, and Retrofit generated from the contract              | 1, 17         | Room entities from the schema            |
| 31  | [ ]    | Domain rules in Kotlin, tested against the same fixtures as the web                         | 17            | —                                        |
| 32  | [ ]    | Board (Keep-style, swipe to archive), editor with 5-second draft and saving dot, history, trash | 6, 7, 8, 9, 16 | `notes`, `note_versions`, `drafts`, `history_events` |
| 33  | [ ]    | Pin, archive, color, labels, checklists, search with `LIKE`                                 | 10, 11, 12    | `notes`, `labels`, `note_labels`, `checklist_ticks` |
| 34  | [ ]    | Login, sync with WorkManager, conflicts, draft sync                                         | 5, 14, 15, 8  | `outbox`, `local_sync_state`, `conflicts`, `drafts` |
| 35  | [ ]    | Reminders with AlarmManager, the boot receiver, and the exact-alarm permission              | 13            | `reminders`                              |

## Done when

The web app and the Android app both pass every flow in sections 3 to 16 against the local server.
