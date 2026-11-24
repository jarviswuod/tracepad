# 33 · Android pin, labels, checklists, search

**Goal:** Add pin, archive, color, labels and checklists on Android, plus search using SQL `LIKE`, with the same rules as the web.

**Spec:** Flow §10, §11 and §12. Schema: `notes`, `labels`, `note_labels`, `checklist_ticks`, `history_events`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, and sections 10, 11 and 12 of docs/Tracepad-Full-Flow.md.
Do task 33 from tasks/roadmap.md, matching the web behavior from tasks 12 to 14.
- Pin, archive, color and labels: history entries for all except color, and never a version.
- Checklists: conversion and item edits cut versions; ticks add history only.
- Search with SQL LIKE '%word%' (case-insensitive) on the current title, body and items; the archived switch; trash excluded; search inside a label.
- Each change writes its outbox row in the same Room transaction.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Room tests for each action's rows, tick history, and the search query cases.
- Compose UI tests for labels, a checklist and search.
- `./tests/run-all.sh` exits 0.
