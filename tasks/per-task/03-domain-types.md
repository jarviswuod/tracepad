# 03 · Domain types

**Goal:** Write every data shape once, in `web/src/domain/types.ts`, matching the schema exactly.

**Spec:** Flow §17 (`domain/`). Schema: every table, including the device-only `outbox` and `local_sync_state`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 17 of docs/Tracepad-Full-Flow.md, and all of docs/Tracepad-Schema.md.
Do task 03 from tasks/roadmap.md: write web/src/domain/types.ts.
- One TypeScript type per schema table that the web app stores: Note, NoteVersion, ChecklistItem, ChecklistTick, Draft, Conflict, HistoryEvent (with a union of event types), Label, NoteLabel, Reminder, OutboxRow, LocalSyncState.
- Use the schema's field names (camelCase), its types (IDs as string UUIDs, timestamps as ISO strings) and its allowed values (unions, not plain strings).
- No logic and no imports from the browser or the database.
Add a type-check to the test run if it isn't there. Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Every field in the schema's web-relevant tables has a matching field.
- `cd web && npx tsc --noEmit` passes.
- `./tests/run-all.sh` exits 0.
