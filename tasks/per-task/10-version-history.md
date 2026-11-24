# 10 · Version history

**Goal:** Show a note's history as a timeline, newest first, mixing versions and small entries. Let the user open an old version read-only and compare two versions in green and red.

**Spec:** Flow §9 (version history). Schema: `note_versions`, `history_events`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, and section 9 of docs/Tracepad-Full-Flow.md.
Do task 10 from tasks/roadmap.md: version history.
- features/history: a timeline, newest first, mixing versions and history events. Each entry shows its time and device.
- Open an old version, read-only.
- Compare two versions side by side with the diff (jsdiff) library: added text green, removed text red.
- Color changes never appear.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- A unit test: the timeline merges versions and events in the right order.
- A unit test: the compare output marks added and removed text.
- A Playwright test: edit twice, open history, open an old version (not editable), compare two.
- `./tests/run-all.sh` exits 0.
