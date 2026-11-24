# 25 · Guest notes join an account

**Goal:** Notes written before signing in join the account at first register or login and upload, without replacing anything.

**Spec:** Flow §4 (register sequence) and §5 (row "Correct login, guest notes on this device"); Flow §14 (row "Signed out (guest)"). Schema: `outbox.user_id`, `local_sync_state`, design note "Guest notes".

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 4, 5 and 14 of docs/Tracepad-Full-Flow.md, and the outbox and local_sync_state sections and design notes of docs/Tracepad-Schema.md.
Do task 25 from tasks/roadmap.md.
- While signed out, there is no sync; outbox rows have no user_id.
- On first register or login on this device, set the user on local rows and pending outbox rows, then sync: push the guest notes and pull the account's notes. Nothing local is replaced.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- A unit test: guest rows get the user ID and stay pending until pushed.
- A Playwright test: write notes signed out, register, and see them on a second signed-in browser context.
- A Playwright test: log in to an account that already has notes, and both sets are there.
- `./tests/run-all.sh` exits 0.
