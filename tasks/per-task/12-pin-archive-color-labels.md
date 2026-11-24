# 12 · Pin, archive, color, labels

**Goal:** Add pin, archive, color and labels. None of them cuts a version. Each adds a history entry, except color.

**Spec:** Flow §10 (pin, archive, color, labels). Schema: `notes`, `labels`, `note_labels`, `history_events`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 10 of docs/Tracepad-Full-Flow.md, and the labels and note_labels tables in docs/Tracepad-Schema.md.
Do task 12 from tasks/roadmap.md.
- Pin and unpin; archive and unarchive: change the note row, add a history entry and an outbox row. Never cut a version.
- Color: change the card color only, with no history entry.
- Labels: create, rename, delete (removed from every note; notes stay), add to a note, remove from a note. Adding or removing on a note adds a history entry. Renaming adds none.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Unit tests: each action writes the right rows; color writes no history; no action cuts a version; deleting a label keeps its notes.
- A Playwright test: pin, archive, color, then add, rename and delete a label.
- `./tests/run-all.sh` exits 0.
