# 09 · The board

**Goal:** Build the Keep-style board: grid or list cards, the "Take a note" bar, the side list, pinned notes first, two sort orders, and the Archive, Trash and Label views.

**Spec:** Flow §6 (the board) and §19 Phase 1 "UI". Schema: `notes`, `note_labels`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 6 of docs/Tracepad-Full-Flow.md, and the "UI" paragraph under Phase 1 in section 19.
Do task 09 from tasks/roadmap.md: the board.
- Cards in a grid or list (a toggle), showing title, preview text and color. A "Take a note" bar on top. A side list: Notes, Reminders, Labels, Archive, Trash.
- Pinned notes first, then the rest. Sort by recently edited (default) or newest created.
- Archive view, Trash view (days left out of 30), Label view (includes archived notes). An empty state.
- Click a card to open the editor.
Read through data/ only. Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Unit tests for the board queries: pin order, both sorts, and what each view filters.
- A Playwright test creates notes, pins one, switches sort and views, and toggles grid and list.
- `./tests/run-all.sh` exits 0.
