# 16 · The outbox

**Goal:** Check that every change from tasks 06 to 15 queues exactly one outbox row in the same transaction as the change, and add the pending count.

**Spec:** Flow §14 (sync, the outbox part). Schema: `outbox` (§8) and the `entity_type` and `op` values of `change_log`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 14 of docs/Tracepad-Full-Flow.md, and the outbox and change_log tables in docs/Tracepad-Schema.md.
Do task 16 from tasks/roadmap.md: the outbox.
- data/outbox.ts: queue, list pending, mark sent, count pending.
- Audit every write path from tasks 06 to 15. Each must add its outbox row in the same idb transaction, with entity_type and op values that match change_log.
- Fix any path that doesn't. Don't add sync yet.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report which paths you checked.
```

**Done when:**
- One test per write path (versions, drafts, pin, archive, color, labels, ticks, trash, restore, delete forever, reminders) checks for exactly one outbox row.
- A test: a failed transaction leaves no outbox row.
- `./tests/run-all.sh` exits 0.
