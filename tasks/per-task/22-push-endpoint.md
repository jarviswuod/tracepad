# 22 · The push endpoint

**Goal:** `POST /sync/push` accepts batches of outbox rows, adds each to the change log with a server number, and safely ignores rows it already has.

**Spec:** Flow §14 (sync: push, partial failure, batches of 100). Schema: `change_log`, plus the entity tables each row updates.

**Model:** Claude Opus 5.5. This is the heart of sync.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 14 of docs/Tracepad-Full-Flow.md, the sync section and design notes of docs/Tracepad-Schema.md, contract/openapi.yaml, and contract/fixtures/push.json.
Do task 22 from tasks/roadmap.md: the push endpoint.
- POST /sync/push takes up to 100 rows. For each row: if row_id is already in change_log, skip it. Otherwise apply it to its entity table and append it to change_log in one transaction.
- Set server_updated_at and received_at from server time; "later wins" uses it.
- Return which rows were accepted.
- Only for the signed-in user's own data.
Conflict detection comes in task 26. Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Server tests: pushing the fixture is accepted; pushing it twice changes nothing; batches over 100 are refused; another user's note is refused; "later wins" for pin and labels.
- `./tests/run-all.sh` exits 0.
