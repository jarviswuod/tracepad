# 05 · Local database module

**Goal:** Open the IndexedDB database through `idb` with every store, index and upgrade step the web app needs. This is the only code that touches the database.

**Spec:** Flow §3 (first open, upgrade steps) and §17 (`data/`). Schema: device copies of the note tables, `outbox`, `local_sync_state`, and the indexes in §9.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 3 and 17 of docs/Tracepad-Full-Flow.md, and docs/Tracepad-Schema.md (sections 3 to 6, 8 and 9).
Do task 05 from tasks/roadmap.md: web/src/data/db.ts.
- Open the database with idb. Create one store per table: notes, noteVersions, checklistTicks, drafts, conflicts, historyEvents, labels, noteLabels, reminders, outbox, localSyncState.
- Add the indexes the board, history, trash, labels and outbox need (from schema section 9).
- Put the schema in a versioned upgrade() so later versions can migrate data.
- Use the types from web/src/domain/types.ts.
Test with fake-indexeddb. Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- `web/src/data/db.test.ts` passes: the database opens, every store and index exists, and an upgrade from an empty database works.
- `./tests/run-all.sh` exits 0.
