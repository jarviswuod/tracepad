# 24 · Web sync

**Goal:** Connect the web app to the server: push the outbox, pull changes, save the bookmark only after applying them, back off when the server is down, and show the sync status icon.

**Spec:** Flow §14 (sync) and §6 (row "Sync status"). Schema: `outbox`, `local_sync_state`.

**Model:** Claude Opus 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 6 and 14 of docs/Tracepad-Full-Flow.md, the outbox and local_sync_state tables in docs/Tracepad-Schema.md, and contract/openapi.yaml.
Do task 24 from tasks/roadmap.md: web sync in web/src/sync/.
- Triggers: coming online, app open, every 30 seconds while open, after each save.
- Push pending rows in batches of 100 and mark accepted rows sent. Then pull, apply in one transaction, and save the bookmark after the commit. Apply a row before the bookmark if it's newer than local.
- Exponential backoff, and a full resync on "bookmark too old".
- Status icon: synced, syncing, offline, "N waiting", "Can't reach server". Refresh the board after a pull.
- Never touch the note open in the editor (see section 8).
Test against the contract fixtures. Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Unit tests with mocked fetch: push then pull, a partial push retries, a dropped pull doesn't save the bookmark, backoff, full resync.
- A Playwright test against the local server: two browser contexts see each other's notes.
- `./tests/run-all.sh` exits 0.
