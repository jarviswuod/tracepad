# 34 · Android login, sync, conflicts, draft sync

**Goal:** Add login to Android with encrypted token storage, sync through WorkManager, and the conflict and draft-sync screens, matching the web.

**Spec:** Flow §5, §8 (draft sync), §14 and §15. Schema: `outbox`, `local_sync_state`, `conflicts`, `drafts`.

**Model:** Claude Opus 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 5, 8, 14 and 15 of docs/Tracepad-Full-Flow.md, and contract/openapi.yaml.
Do task 34 from tasks/roadmap.md, matching the web behavior from tasks 20 and 24 to 27.
- Login, register and logout screens. Tokens in DataStore, encrypted with the Android Keystore. Quiet refresh. The logout warning when changes haven't synced.
- SyncWorker (WorkManager): push, pull, bookmark after the commit, backoff, and a run when the network comes back. Guest notes join on first sign-in.
- The conflict badge and compare screen, and "Laptop is editing" for drafts from other devices.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Unit tests with a mock server (OkHttp MockWebServer) and the contract fixtures: push, pull, partial retry, bookmark safety, conflict detection.
- A manual check against the local server: a web note appears on the phone, and the reverse.
- `./tests/run-all.sh` exits 0.
