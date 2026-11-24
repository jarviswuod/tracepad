# 06 · Create and edit notes

**Goal:** Create and edit notes the Tracepad way: device-made IDs, a draft every 5 seconds, and a new version on leaving the note or pressing Ctrl+S.

**Spec:** Flow §7 (create) and §8 (edit, drafts, versions). Schema: `notes`, `note_versions`, `drafts`, `outbox`.

**Model:** Claude Opus 5.5. These are the core versioning rules.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 7 and 8 of docs/Tracepad-Full-Flow.md, and the notes, note_versions and drafts tables in docs/Tracepad-Schema.md.
Do task 06 from tasks/roadmap.md: create and edit.
- domain/versioning.ts: when to cut a version, the empty-note rule, and the unchanged-text rule.
- data/notes.ts: save a draft; cut a version (with its parent link and an outbox row) in one transaction.
- features/editor: crypto.randomUUID() IDs, a 5-second debounced draft, a version on leave or Ctrl+S.
Text editing only (no checklists yet). Ask before relying on anything marked "Proposed".
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- `domain/versioning.test.ts` covers: an empty note is discarded, unchanged text cuts no version, the first version has no parent, and an edit's parent is the opened version.
- `data/notes.test.ts`: the version, the note pointer and the outbox row are written in one transaction.
- A Playwright test creates a note, edits it, leaves, and sees two versions.
- `./tests/run-all.sh` exits 0.
