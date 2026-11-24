# 11 · Trash

**Goal:** Move to trash, restore, undo, delete forever, empty the trash, and remove notes automatically after 30 days.

**Spec:** Flow §16 (delete). Schema: `notes.trashed_at`, `history_events`, `outbox`, and the delete-forever cascade in §10 of the schema.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 16 of docs/Tracepad-Full-Flow.md, and the notes table and design notes in docs/Tracepad-Schema.md.
Do task 11 from tasks/roadmap.md: trash.
- Move to trash: set trashed_at, keep pin and color, hide it from the board and search, add a history entry and an outbox row. An "Undo" snackbar for a few seconds.
- Restore: back where it was (archived or not, pinned or not, same color), with a history entry.
- Delete forever (asks first) and Empty trash: remove the note, its versions, history, ticks, labels and reminder, plus an outbox row.
- At startup, remove notes trashed more than 30 days ago.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Unit tests: trash keeps pin and color, restore returns to the same place, delete forever removes every related row, and the 30-day cleanup.
- A Playwright test: trash, undo, trash, restore, delete forever.
- `./tests/run-all.sh` exits 0.
