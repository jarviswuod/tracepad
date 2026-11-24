# 17 · Offline app shell

**Goal:** Make the web app load offline after the first visit, and show "Update ready, reload" when a new version is deployed.

**Spec:** Flow §3 (first open, offline opens, new version deployed). Schema: none.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, and section 3 of docs/Tracepad-Full-Flow.md.
Do task 17 from tasks/roadmap.md: the offline app shell.
- Add vite-plugin-pwa (Workbox) with a web manifest and icons in web/public/.
- Cache the app shell on the first online visit; later opens load from the cache and read notes from IndexedDB.
- When a new service worker is waiting, show "Update ready, reload". Don't reload on your own.
Keep the service worker code in web/src/sw/. Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- A Playwright test: load once online, go offline, reload, and the board shows existing notes.
- A Playwright test (or a component test with a mocked registration) for the update prompt.
- `cd web && npm run build` succeeds.
- `./tests/run-all.sh` exits 0.
