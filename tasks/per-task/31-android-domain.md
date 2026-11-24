# 31 · Android domain rules

**Goal:** Port `web/src/domain` to Kotlin (versioning, conflicts, search), tested against the same contract fixtures as the web.

**Spec:** Flow §17 (`domain/` is the same in TypeScript and Kotlin), plus the rules in §7, §8, §12 and §15. Schema: none directly.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, and section 17 of docs/Tracepad-Full-Flow.md. Then read web/src/domain/ and its tests.
Do task 31 from tasks/roadmap.md.
- Port versioning, conflicts and search to android/app/src/main/java/com/tracepad/domain/ in Kotlin. Keep the same behavior and names where Kotlin allows; no Android imports.
- Port the web domain tests to JUnit, and run them against contract/fixtures/ as well.
Don't change the web code. Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Every web domain test has a Kotlin twin, and both pass.
- The Kotlin tests pass against every fixture in `contract/fixtures/`.
- `./tests/run-all.sh` exits 0.
