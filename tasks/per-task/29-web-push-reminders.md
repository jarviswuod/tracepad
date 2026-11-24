# 29 · Web Push reminders

**Goal:** Use the server's Web Push as the backup for reminders, so a reminder still arrives when the tab is closed. The local timer stays primary.

**Spec:** Flow §13 (rows "Web, tab closed, after the server exists" and "Local alarm is primary, server push is backup"). Schema: `reminders`, `web_push_subscriptions`.

**Model:** Claude Opus 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 13 of docs/Tracepad-Full-Flow.md, and the reminders and web_push_subscriptions tables in docs/Tracepad-Schema.md.
Do task 29 from tasks/roadmap.md.
- Web: subscribe to push with VAPID keys and send the subscription to the server; the service worker shows the notification, and tapping it opens the note.
- Server: a scheduled job finds due reminders (not dismissed, not yet pushed, note not trashed) and sends them with the web-push Java library; then it sets push_sent_at.
- The local timer stays primary. Don't show a notification twice on a device that already showed it.
- Reminder changes sync to every device, which drops the old timer and arms the new one.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Server tests: the due query, push_sent_at set once, trashed notes skipped, a dismissed reminder isn't pushed.
- A web test: the service worker push handler shows a notification and opens the note.
- `./tests/run-all.sh` exits 0.
