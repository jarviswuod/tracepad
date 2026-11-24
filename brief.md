# Tracepad brief

## What it is

Tracepad is an offline-first notes app that looks and works like Google Keep. It keeps every version of every note. You can write without an account or a connection. Notes are saved on the device first and sync to a server when one is available. It is built in three parts, in this order: a web app, a server, and an Android app.

Full detail: `docs/Tracepad-Full-Flow.md`. Data model: `docs/Tracepad-Schema.md`. Build order: `tasks/roadmap.md`.

## Stack

| Part    | Stack                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------- |
| Web     | TypeScript, React, Vite, React Router, IndexedDB through `idb`, `vite-plugin-pwa` service worker |
| Server  | Java 21, Spring Boot (Maven), PostgreSQL, Flyway, Spring Security with BCrypt and JWT, Spring Mail |
| Android | Kotlin, Jetpack Compose, Room, Retrofit, WorkManager, AlarmManager                                  |
| Shared  | `contract/openapi.yaml` and JSON fixtures that all three parts test against                         |
| Tests   | Vitest, Playwright, JUnit 5, Testcontainers, Room in-memory and Compose UI tests                   |
| Local   | `npm run dev`, Docker Compose (server, Postgres, Mailpit), Android Studio emulator                  |

## Non-negotiables

1. **Offline-first.** Every change is saved on the device first, in the same transaction as its outbox row. The server is never needed to read, write or search.
2. **Words are never lost.** A crash leaves a draft that becomes a version on the next open. Conflicts keep both edits. An edit can bring back a note that was deleted elsewhere.
3. **Typing never waits.** Sync runs in the background and never touches the text being typed.
4. **Versions are never changed.** Editing cuts a new version with a parent link. Pin, archive, color, labels, ticks and reminders never cut a version.
5. **Conflicts are narrow.** A conflict needs both devices offline, the same note edited on each, and a moved parent. Everything else follows "the later change wins."
6. **Device-made UUIDs** for every row, so pushes can be retried without making duplicates.
7. **Trash is a flag.** Notes are removed for good only by "delete forever" or after 30 days, with tombstones kept 60 days.
8. **Accounts are soft-deleted.** The row stays in the database.
9. **Matches the spec.** Nothing beyond `docs/Tracepad-Full-Flow.md`. Every feature is tested before it is done.
