# AGENTS.md

Standing rules for any AI agent working on Tracepad.

## Before building

1. Read `brief.md`, then the sections of `docs/Tracepad-Full-Flow.md` that the task touches.
2. Find the task in `tasks/roadmap.md`. Work on one chunk at a time, in order.
3. Any data you store must match `docs/Tracepad-Schema.md`: table names, field names, types and relationships.
4. Don't start a task from a new phase until the owner has signed off the previous phase's checkpoint in `tasks/human-checkpoints.md`.

## While building

- **Stay inside the spec.** Build only what `docs/Tracepad-Full-Flow.md` describes. No extra features, screens, tables, settings or libraries. Version 2 features (section 18) wait until version 1 is done.
- **Keep changes scoped.** Change only what the requested task needs. No drive-by refactors, renames or reformatting.
- **Follow the file structure** in section 17 of the flow document. Only `data/` touches the local database. `domain/` depends on nothing.
- **Items marked "Proposed"** in the spec are not agreed yet. Ask before relying on one.
- **If the spec contradicts itself or the schema,** stop and ask. Don't pick one quietly.
- **Never edit** `docs/Tracepad-Full-Flow.md` or `docs/Tracepad-Schema.md` unless the task asks for it.

## Before finishing

1. Always write tests for the feature you're building, before or alongside the code. Then run `./tests/run-all.sh` (details in `tests/README.md`); every test must pass.
2. Report what changed, what was tested, and anything you couldn't do.
3. Don't commit. The owner commits each feature after testing it by hand. Suggest a commit message in this style: `feat(web): autosave drafts every 5 seconds`.
4. If a change affects setup, commands, features, architecture, or workflow, update only those sections of the root `README.md`. Leave the rest, and summarize the README edits. If it's unclear whether the README should change, ask. Don't guess.
