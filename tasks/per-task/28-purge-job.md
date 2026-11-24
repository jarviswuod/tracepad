# 28 · Server purge job

**Goal:** A daily server job removes notes trashed more than 30 days ago, writes tombstones so offline devices remove them too, and clears tombstones after 60 days.

**Spec:** Flow §16 (rows "30 days pass", "An offline device still has it", and the "Edit on one device, delete forever on the other" row in §15). Schema: `notes.trashed_at`, `tombstones`, `change_log`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 15 and 16 of docs/Tracepad-Full-Flow.md, and the notes, tombstones and change_log tables in docs/Tracepad-Schema.md.
Do task 28 from tasks/roadmap.md.
- A daily Spring @Scheduled job: remove notes trashed more than 30 days ago (the cascade removes their related rows); write a purge row to change_log and a tombstone for each.
- The same job removes tombstones older than 60 days.
- Delete forever from a device goes through the same purge path.
- An edit arriving for a purged note is a "Proposed" case in section 15; ask me before handling it.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Server tests with a fixed clock: 29 days kept, 31 days purged with a tombstone, tombstone gone after 60 days, a pull returns the tombstone.
- `./tests/run-all.sh` exits 0.
