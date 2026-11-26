# Tracepad

Tracepad is an offline-first notes app in the style of Google Keep that keeps every version of every note. You can write without an account and without a connection: every change is stored on the device first, and older versions stay available in a history you can browse and compare.

**Status:** the web app works fully offline. The server and the Android app are planned but not started; their folders hold only placeholders. See [Roadmap](#roadmap).

- Product behavior: [docs/Tracepad-Full-Flow.md](docs/Tracepad-Full-Flow.md)
- Data model: [docs/Tracepad-Schema.md](docs/Tracepad-Schema.md)
- Build order: [tasks/roadmap.md](tasks/roadmap.md)

## Contents

- [Goals](#goals)
- [Features](#features)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Architecture](#architecture)
- [Design decisions](#design-decisions)
- [Repository layout](#repository-layout)
- [Development workflow](#development-workflow)
- [Roadmap](#roadmap)

## Goals

- **Offline-first.** Reading, writing, and searching use only the local database. The app never needs a server.
- **Words are never lost.** Keystrokes go into a draft, and a draft left behind by a crash becomes a version the next time the app opens.
- **Typing never waits.** The draft timer and the saving indicator run off the keystroke path.
- **Versions are never changed.** An edit adds a new version linked to its parent. Pin, archive, color, labels, checklist ticks, and reminders do not create versions.
- **IDs are made on the device**, so a retried write cannot create a duplicate.
- **Trash is a flag.** A trashed note stays in the database until it is deleted forever or has been in the trash for more than 30 days.

## Features

The web app runs signed out. On the first visit it creates a device ID and stores it in the local database.

| Area | What works |
| --- | --- |
| Notes and drafts | Create and edit text notes; drafts saved 5 seconds after the last keystroke; a version on leaving the note or on Ctrl+S |
| Saving indicator | Filled dot while keystrokes are unsaved; hollow ring while the change waits in the outbox |
| Board | Notes, Reminders, Archive, Trash, and per-label views; grid or list; pinned first; sort by edited, created, or custom drag order; day headings |
| History | Timeline of versions and events, read-only old versions, word-level compare |
| Organizing | Pin, archive, six card colors, labels created and renamed from the side nav |
| Checklists | Convert between text and checklist, edit items, tick items |
| Search | Case-insensitive search of the current title, body, and checklist items on each view, with an "include archived" switch |
| Trash | Trash, restore, undo, delete forever, empty trash, 30-day cleanup on startup |
| Reminders | One reminder per note, fired by an in-tab timer with a notice, a sound, and an optional system notification; missed reminders shown on the next open |
| Offline shell | Service worker in production builds, with an "Update ready, reload" prompt |

Feature details:

- **Notes.** A new note with an empty title and body is discarded, unless Archive or Remind me was used on it. Text that matches the version you opened does not create a new version, even if you typed and then undid the change. Empty fields are stored as `null`.
- **Drafts.** The debounce is `DRAFT_DEBOUNCE_MS` in `web/src/features/editor/Editor.tsx`. A draft can exist before its note row; the row is created when the first version is cut.
- **Saving indicator.** The hollow ring ("Not synced yet") stays after a save because nothing sends the outbox yet. The dot is hidden only when the note has no pending outbox rows.
- **Board.** Routes are `/home`, `/reminders`, `/archive`, `/trash`, and `/label/<name>`, and `/` redirects to `/home`. The sort is kept in `localStorage` (`tracepad.boardSort`, `tracepad.boardCustomBase`). Grid layout uses [Muuri](https://github.com/haltu/muuri). Dragging a card writes `notes.sortPosition` and switches the sort to custom. Below 720px wide, the card actions are always visible.
- **History.** `/history/<noteId>` lists versions together with events that don't cut a version: pin, labels, archive, trash, ticks, and reminders. `/history/<noteId>/<versionId>` opens one version read-only. Compare uses `diffWords` from the [`diff`](https://github.com/kpdecker/jsdiff) package. Color changes are not recorded in history.
- **Labels.** A label view shows archived notes and hides trashed ones. Removing a label from a note sets `isRemoved` on the link and keeps the row.
- **Checklists.** Converting a note, or adding, removing, rewording, or reordering items, cuts a version. A tick is stored as its own row and recorded as a history event. Ticked items are shown below open items, and their stored positions don't change.
- **Search.** The query lives in the page URL as `text`, and the archived switch as `archived=1`. Older versions are not searched.
- **Trash.** The undo snackbar stays for 5 seconds. Delete forever removes the note and its related rows.
- **Reminders.** A trashed note's reminder does not fire. The app asks for notification permission once.

## Getting started

### Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`, the range Vite requires, and npm
- Git
- Chromium for Playwright, installed below

### Install

```bash
git clone git@github.com:jarviswuod/tracepad.git
cd tracepad/web
npm install
npx playwright install chromium
```

The lockfile is `web/package-lock.json`. All npm commands run from `web/`.

### Run

```bash
npm run dev
```

Open http://localhost:5173. Notes are kept in the browser's IndexedDB, so a reload keeps them. To inspect the stored data, open DevTools → **Application → IndexedDB → tracepad**.

The dev server does not register the service worker. To try the offline shell and the update prompt, build and preview:

```bash
npm run build
npm run preview
```

`npm run build` runs `tsc -b && vite build`. The preview is served at http://localhost:4173.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check, then production build to `web/dist`, including the service worker |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc -b` |
| `npm test` | Vitest, one pass |
| `npm run e2e` | Playwright end-to-end tests |
| `npm run lint` | oxlint |

## Testing

Run the whole suite from the repository root:

```bash
./tests/run-all.sh
```

The script first checks the repository skeleton (`tests/repo-skeleton.sh`). Then it runs every part that has a test runner and stops at the first failure. Today that is only the web app, which runs these in order:

```bash
cd web
npm run typecheck
npm test
npm run e2e
```

- **Unit and component tests** run on Vitest with jsdom, React Testing Library, and [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB). They sit next to the code as `src/**/*.test.{ts,tsx}`. The setup file is `web/src/test/setup.ts`.
- **End-to-end tests** run on Playwright in Chromium and live in `web/e2e/`. Unless a server is already running, Playwright builds the app and serves it at http://127.0.0.1:4173 (`web/playwright.config.ts`). Because of that build, this step is the slowest.
- **Lint** (`npm run lint`) is not part of `run-all.sh`.

`server/` has no `mvnw` and `android/` has no `gradlew`, so `run-all.sh` skips both. See [tests/README.md](tests/README.md).

## Architecture

The web app is a React single-page app built with Vite. All state lives in IndexedDB on the device.

```text
web/src/
  main.tsx      mounts React
  app/          shell, routes, opens the database, runs startup cleanup
  domain/       pure rules: versioning, search, trash, board order, day groups, reminders
  data/         the only code that opens IndexedDB
  features/     screens: board, editor, history, labels, reminders, search, trash
  ui/           note modal, icons, side nav
  sw/           service worker, registration, update prompt
  api/          empty
  sync/         empty
```

Dependencies point one way:

- `domain/` imports only its own files. It has no React, browser, or database code, so the rules are tested as plain functions.
- `data/` is the only layer that reads or writes IndexedDB. A storage change stays inside this folder.
- `features/` and `ui/` call `domain/` and `data/`. They never open the database themselves.

### Startup

`AppShell` (`web/src/app/AppShell.tsx`) opens the database. It then runs `startupLocalCleanup`, which deletes notes that have been in the trash for more than 30 days and then turns leftover drafts into versions. Only after that does it render the routes and start the reminder timers. Cleanup runs before draft recovery so that a draft cannot bring back a note that has expired.

### Versions

`decideContentCut` in `web/src/domain/versioning.ts` returns one of three results: `discard`, `unchanged`, or `cut`. Discard applies only to a note with no version yet and empty content. In one transaction, a cut writes the new version, points `notes.currentVersionId` at it, deletes this device's draft, and queues an outbox row. The parent is the version that was opened. A note's first version has no parent.

### Local database

The local database uses IndexedDB through [`idb`](https://github.com/jakearchibald/idb). The database is named `tracepad`, and its schema version is `DB_VERSION` in `web/src/data/db.ts` (currently 2).

Object stores: `notes`, `noteVersions`, `checklistTicks`, `drafts`, `conflicts`, `historyEvents`, `labels`, `noteLabels`, `reminders`, `outbox`, and `localSyncState`. Field names follow [docs/Tracepad-Schema.md](docs/Tracepad-Schema.md).

- **Upgrades** run in order from the version the browser already has. A released step is never edited. A schema change adds a new `if (oldVersion < N)` block. Version 2 sets `sortPosition: null` on notes saved before custom ordering existed.
- **Indexes** differ from the server schema on purpose. IndexedDB leaves a row out of an index when any part of its key is null, and it cannot index booleans. So the indexes leave out `userId`, and the pinned, archived, removed, and resolved filters run in code over the index results.

### Outbox

Every local change queues one `outbox` row in the same readwrite transaction as the change itself (`queueOutbox` in `web/src/data/outbox.ts`). If the transaction aborts, the row is discarded with it. Rows start as `pending`. `markOutboxSent` exists and is tested, but nothing calls it yet, so rows stay pending and the saving ring stays visible.

The `conflicts` store and the sync fields on `localSyncState` exist in the schema but are not written to: `bookmark` stays `0`, and `serverUpdatedAt` and `receivedAt` stay `null`.

### Offline shell

`vite-plugin-pwa` in `injectManifest` mode builds `web/src/sw/sw.ts` with Workbox. The worker precaches the built shell and answers every navigation with `index.html`, so all routes open offline. Registration (`web/src/sw/register.ts`) only happens in production builds. A new worker waits until the user clicks "Update ready, reload". It is never activated behind the user's back.

## Design decisions

- **Offline-first, not offline-tolerant.** The local database is the source of truth for the UI. There is no fetch layer, and no screen waits on the network. Later sync is meant to work in the background, outside the typing path.
- **Append-only versions.** Saving a version as a new row with a parent link means history, compare, and future conflict detection all read the same data. Metadata changes such as pin, color, labels, ticks, and reminders are stored as fields or as history events, so they don't fill the version list.
- **Drafts separate from versions.** Keystrokes go into one draft per note and per device on a 5-second debounce. A version is cut only when the note is committed. History records deliberate saves instead of every pause, and a crash still leaves the draft behind for recovery.
- **IndexedDB through `idb`.** It is a thin, typed wrapper around the browser API with no query layer of its own. Everything that touches it is in `data/`, so it can be replaced without changing screens or rules.
- **Device-made UUIDs** (`crypto.randomUUID()`). Each row's ID exists before any server sees it, so a retried push can be accepted only once.
- **Outbox written now, sender later.** Queuing the outbox row in the same transaction as each change fixes the sync shape from the start. When sync is added, it only has to read and send the rows that are already there.
- **No sync yet.** Accounts, push, pull, and conflicts depend on the server, which doesn't exist yet. Until then the app is fully usable as a single-device notes app.

## Repository layout

```text
README.md            this file
AGENTS.md            standing rules for AI agents working in the repo
brief.md             one-page product brief
.editorconfig        LF line endings, 2-space indent
.gitignore
docs/                product flow, schema, and the original PDF
learnings/           owner's notes
tasks/               roadmap, per-task files, human checkpoints
tests/               run-all.sh and the repository skeleton check
contract/            placeholder (fixtures/.gitkeep)
server/              placeholder (.gitkeep)
android/             placeholder (.gitkeep)
web/
  package.json
  vite.config.ts     Vite, Vitest, and the PWA plugin
  playwright.config.ts
  index.html
  public/            icons and web manifest
  e2e/               Playwright tests
  src/               application code (see Architecture)
```

## Development workflow

1. Pick the next task in [tasks/roadmap.md](tasks/roadmap.md). Each task file in `tasks/per-task/` gives the goal, the spec sections, and the tests that must pass.
2. Read the related sections of [docs/Tracepad-Full-Flow.md](docs/Tracepad-Full-Flow.md). Any stored data must match [docs/Tracepad-Schema.md](docs/Tracepad-Schema.md).
3. Write tests with the code. Put rules in `domain/` with Vitest tests. Put storage in `data/`, tested against `fake-indexeddb`. Put screens in `features/` or `ui/`, with component tests, plus a Playwright spec in `web/e2e/` when the click path changes.
4. While you work, use `npm run dev` and `npm test`. Run `npm run e2e` when the UI flow changes.
5. Before you finish, run `./tests/run-all.sh` from the root. Every step must pass.
6. If the change affects setup, commands, features, architecture, or workflow, update the matching sections of this README.

Between phases, the owner checks the build by hand using [tasks/human-checkpoints.md](tasks/human-checkpoints.md). AI agents also follow [AGENTS.md](AGENTS.md).

## Roadmap

Nothing in this section exists in the repository yet, and none of it runs from this checkout. The full ordered plan is in [tasks/roadmap.md](tasks/roadmap.md).

- **Server (phase 2).** Java 21, Spring Boot with Maven, PostgreSQL, and Flyway. The planned local command is `docker compose up`, which would start Postgres, Mailpit, and the server. There is no Compose file or Maven project yet.
- **API contract.** `contract/openapi.yaml` and shared push, pull, and conflict fixtures for all three parts to test against.
- **Accounts and sync.** Register, login, password reset, and account soft-delete. Push and pull endpoints, a web sync loop that drains the existing outbox, guest notes joining an account, conflict detection and resolution, draft sync between devices, and the server purge job.
- **Web Push reminders,** so reminders arrive while the tab is closed.
- **Android (phase 3).** Kotlin, Jetpack Compose, and Room, opened in Android Studio. It will have the same domain rules, tested against the shared fixtures, plus WorkManager sync and exact alarms.

Version 2 features are described in section 18 of the flow document and wait until version 1 is done.
