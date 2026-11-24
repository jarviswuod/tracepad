# 08 · Crash recovery

**Goal:** When the app opens, turn any leftover draft into a version before the board shows, so a crash never loses words.

**Spec:** Flow §3 (row "Leftover draft from a crash") and §8 (row "The tab or the browser crashes"). Schema: `drafts`, `note_versions`, `outbox`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, and sections 3 and 8 of docs/Tracepad-Full-Flow.md.
Do task 08 from tasks/roadmap.md: crash recovery.
- At startup (web/src/app), before the board renders, find this device's leftover drafts.
- For each one, cut a version through the same code path as leaving the note (same rules: empty, unchanged, parent link, outbox row), then delete the draft.
- Leave alone drafts that belong to other devices.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- A unit test: a leftover draft becomes one version with the right parent, and the draft is removed.
- A unit test: a leftover draft with unchanged text cuts no version.
- A Playwright test: type, reload before leaving the note, and the text is there as a version.
- `./tests/run-all.sh` exits 0.
