# 14 · Search

**Goal:** Search the current text of notes on the device: titles, bodies and checklist items. Archived notes appear only when a switch is on. Search can stay inside one label.

**Spec:** Flow §12 (search). Schema: `notes`, `note_versions`, `note_labels`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, and section 12 of docs/Tracepad-Full-Flow.md. Also read item 14 of section 19. Its "every note by default" disagrees with section 12 on archived and trashed notes. Ask me which wins before you build.
Do task 14 from tasks/roadmap.md: search.
- domain/search.ts: case-insensitive match on title, body and checklist items of the current version only.
- A switch next to the search box to include archived notes, each marked "Archived". Trashed notes are never included.
- Inside a label view, search only that label.
- "No notes match" when empty. Never uses the server.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Unit tests for `domain/search.ts`: case, checklist items, old versions not matched, archived switch, trash excluded, label scope.
- A Playwright test: search, toggle the archived switch, search inside a label.
- `./tests/run-all.sh` exits 0.
