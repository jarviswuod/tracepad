# 07 · Saving dot and non-blocking typing

**Goal:** Show the small saving dot (unsaved keystrokes, then "not synced yet"), and make sure typing never waits on saving or sync.

**Spec:** Flow §8 (rows "Typing while a sync runs" and "Saving indicator"). Schema: `drafts`, `outbox`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, and section 8 of docs/Tracepad-Full-Flow.md.
Do task 07 from tasks/roadmap.md.
- Saving dot near the note: grey while there are unsaved keystrokes, gone once the draft is saved, and a second state for "not synced yet" (pending outbox rows for this note). No popups.
- The editor owns its text state. Saving a draft and background work must never block, pause, or overwrite what is being typed.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- A component test checks each dot state: unsaved, saved, not synced.
- A Playwright test types steadily while drafts save, and every keystroke lands in order.
- `./tests/run-all.sh` exits 0.
