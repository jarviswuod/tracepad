# 02 · Web app scaffold

**Goal:** Set up `web/` with Vite, React, TypeScript and React Router, plus Vitest, `fake-indexeddb` and Playwright, with one unit test and one end-to-end test passing.

**Spec:** Flow §1 (tech stack) and §17 (`web/` layout). Schema: none.

**Model:** Composer 2.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, and sections 1 and 17 of docs/Tracepad-Full-Flow.md.
Do task 02 from tasks/roadmap.md: scaffold web/.
- Vite + React + TypeScript (strict). Add React Router and the src/ folders from section 17 (app, domain, data, sync, api, features, ui, sw).
- Add Vitest with fake-indexeddb, and React Testing Library.
- Add Playwright in web/e2e/.
- package.json scripts: "dev", "build", "test" (Vitest, run once), "e2e" (Playwright).
- One trivial unit test and one Playwright test that loads the page.
Don't add any features. Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- `cd web && npm test` passes one test.
- `cd web && npm run e2e` passes one test.
- `./tests/run-all.sh` exits 0.
