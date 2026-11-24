# 23 · The pull endpoint

**Goal:** `GET /sync/pull` returns change-log rows after a device's bookmark, includes tombstones, keeps newer rows even before the bookmark, and moves the bookmark forward.

**Spec:** Flow §14 (pull, "bookmark too old") and §16 (tombstones). Schema: `change_log`, `sync_state`, `tombstones`.

**Model:** Claude Opus 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 14 and 16 of docs/Tracepad-Full-Flow.md, the sync tables in docs/Tracepad-Schema.md, contract/openapi.yaml, and contract/fixtures/pull.json.
Do task 23 from tasks/roadmap.md: the pull endpoint.
- GET /sync/pull?after=<seq> returns the user's change_log rows after that seq, oldest first, in pages, with the new bookmark.
- Include tombstones for notes deleted forever.
- If the bookmark is older than the retained log, answer "bookmark too old" so the device does a full download.
- Update sync_state for the device.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Server tests: pull after 0 returns everything, pull after a bookmark returns only newer rows, paging, tombstones included, "bookmark too old", sync_state updated, another user's rows never returned.
- `./tests/run-all.sh` exits 0.
