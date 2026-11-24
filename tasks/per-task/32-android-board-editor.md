# 32 · Android board, editor, history, trash

**Goal:** Build the Keep-style Android board, the editor with the 5-second draft and saving dot, crash recovery, version history, and trash.

**Spec:** Flow §6, §7, §8, §9 and §16, plus the Android "UI" paragraph in §19 Phase 3. Schema: `notes`, `note_versions`, `drafts`, `history_events`.

**Model:** Claude Opus 5.5. This is a large chunk.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 6, 7, 8, 9 and 16 of docs/Tracepad-Full-Flow.md, and the "UI" paragraph under Phase 3 in section 19.
Do task 32 from tasks/roadmap.md, matching the web behavior from tasks 06 to 11.
- Board: grid or list cards, a create button at the bottom right, Notes/Reminders/Labels/Archive/Trash in the top-left menu, swipe a card to archive, pinned first, two sorts.
- Editor: a 5-second draft, a version on leave, the saving dot, and typing that never waits. Crash recovery at startup.
- History timeline with compare, read-only old versions. Trash with restore, undo, delete forever, and 30-day cleanup.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Room tests for the draft-to-version path, crash recovery and the trash rules.
- Compose UI tests (emulator) for the board, editor and history.
- `./tests/run-all.sh` exits 0.
