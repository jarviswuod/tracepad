# 35 · Android reminders

**Goal:** Fire reminders on Android with exact alarms, even when the app is closed. Set them again after a reboot, and show missed ones as late.

**Spec:** Flow §13 (the Android rows). Schema: `reminders`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 13 of docs/Tracepad-Full-Flow.md, and the reminders table in docs/Tracepad-Schema.md.
Do task 35 from tasks/roadmap.md.
- AlarmManager setExactAndAllowWhileIdle as the primary alarm; ask for SCHEDULE_EXACT_ALARM, and explain that alarms may be late without it.
- An alarm receiver shows the notification; tapping it opens the note.
- A boot receiver sets every alarm again from Room and shows missed reminders as late.
- Reminders synced from other devices: drop the old alarm and arm the new one. Trashed notes pause; archived notes still fire.
Repeating reminders are a version 2 item in section 20; ask before building them.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Unit tests for alarm scheduling (with a fake AlarmManager): set, change, cancel, trash pause, re-arm on boot.
- An emulator test: a reminder a few seconds ahead fires with the app closed.
- `./tests/run-all.sh` exits 0.
