# 15 · Reminders on the web (tab open)

**Goal:** Set, change and remove reminders. They fire while the tab is open, and reminders missed while it was closed are shown on the next open.

**Spec:** Flow §13 (reminders; the web v1 rows). Schema: `reminders`, `history_events`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 13 of docs/Tracepad-Full-Flow.md, and the reminders table in docs/Tracepad-Schema.md.
Do task 15 from tasks/roadmap.md: web reminders while the tab is open.
- Set, change or remove a reminder (one per note). Refuse past times with "Pick a future time." Each change adds a history entry and an outbox row.
- A local timer plus the Notifications API while the tab is open; ask for permission once and explain, with an in-app banner if it's blocked. Tapping opens the note.
- On startup, show missed reminders.
- Archived notes still fire; trashed notes pause.
Repeating reminders are a version 2 item in section 20; ask before building them.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Unit tests with fake timers: fires on time, past time refused, change re-arms, remove cancels, trashed pauses, missed is detected.
- A Playwright test: set a reminder a few seconds ahead and see it fire.
- `./tests/run-all.sh` exits 0.
