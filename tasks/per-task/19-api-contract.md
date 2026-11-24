# 19 · API contract

**Goal:** Write `contract/openapi.yaml` for every server endpoint, plus example JSON fixtures for a push, a pull and a conflict that the web, server and Android tests all use.

**Spec:** Flow §14 (sync endpoints), §4 and §5 (auth endpoints), §17 (`contract/`). Schema: `change_log`, `sync_state`, `tombstones`.

**Model:** Claude Opus 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 4, 5, 14, 15, 16 and 17 of docs/Tracepad-Full-Flow.md, and the sync tables in docs/Tracepad-Schema.md.
Do task 19 from tasks/roadmap.md: the API contract.
- contract/openapi.yaml: /auth/register, /auth/login, /auth/refresh, /auth/logout, password reset, delete account, POST /sync/push, GET /sync/pull. Request and response shapes, and error codes (409 for a taken email; "bookmark too old").
- contract/fixtures/: push.json, pull.json, conflict.json, with field names matching the schema.
- Tests on web and server that load each fixture and check it against the OpenAPI schemas.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- `openapi.yaml` passes a lint check.
- Web and server tests validate every fixture against the contract.
- `./tests/run-all.sh` exits 0.
