# 01 · Repo skeleton

**Goal:** Create the folder layout from section 17 with a root `README.md`, `.gitignore` and `.editorconfig`, so every later task has a place to go.

**Spec:** Flow §17 (file structure). Schema: none.

**Model:** Composer 2.5. This is simple scaffolding.

**Prompt:**

```text
Read AGENTS.md, brief.md, and section 17 of docs/Tracepad-Full-Flow.md.
Do task 01 from tasks/roadmap.md: create the repo skeleton.
- Create the top-level folders from section 17: contract/ (with fixtures/), web/, server/, android/. Keep docs/, learnings/, tasks/ and tests/ as they are.
- Add a root README.md that says how each part will run, in a few lines each.
- Add .gitignore (Node, Maven, Gradle, Android, IDE files) and .editorconfig (same indentation and line endings everywhere).
- Don't scaffold any app code yet. Empty folders get a .gitkeep.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report what you created.
```

**Done when:**
- The folders match section 17, and `README.md`, `.gitignore` and `.editorconfig` exist.
- `./tests/run-all.sh` exits 0.
