# 13 · Checklists

**Goal:** Turn notes into checklists and back, and edit items. Ticking an item adds a history entry, never a version.

**Spec:** Flow §11 (checklists). Schema: `note_versions.checklist_items`, `checklist_ticks`, `history_events`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 11 of docs/Tracepad-Full-Flow.md, and the note_versions and checklist_ticks tables in docs/Tracepad-Schema.md.
Do task 13 from tasks/roadmap.md: checklists.
- Text to checklist (each line becomes an item) and back (items become lines). Each conversion cuts a version.
- Adding, removing, rewording or reordering items cuts a version on leaving the note.
- Tick or untick: strike-through, move to the bottom, store it in checklist_ticks, add a history entry and an outbox row. No version.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Unit tests: both conversions, item edits cut a version, ticks cut no version but add a history entry.
- A Playwright test: make a checklist, tick an item, check history.
- `./tests/run-all.sh` exits 0.
