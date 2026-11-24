# 26 · Conflicts

**Goal:** Detect real conflicts (both devices offline, the same note edited, the parent moved), merge the earlier edit, badge the later one, and let the user compare and pick.

**Spec:** Flow §15 (conflicts). Schema: `conflicts`, `note_versions.parent_version_id`.

**Model:** Claude Opus 5.5. These are the hardest rules in the spec.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 15 of docs/Tracepad-Full-Flow.md (and section 14's row "Clock wrong on a device"), the conflicts and note_versions tables in docs/Tracepad-Schema.md, and contract/fixtures/conflict.json.
Before building, ask me whether "timestamps decide" means device edit time or server receive time; the two sections disagree.
Do task 26 from tasks/roadmap.md.
- domain/conflicts.ts and the server: a version whose parent is no longer the note's current version is a conflict. The earlier edit merges and the later one gets a conflicts row.
- Web: a badge on the card; a compare screen (incoming green, outgoing red); pick one, which moves the current pointer and syncs; or decide later. Nothing is ever discarded.
- An edit after a trash on another device: the note stays in the trash with the new version and a "Restore?" banner.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Domain tests and server tests with the conflict fixture: detection, three devices, no conflict for pin, labels or ticks, "the later pick wins".
- A Playwright test: two offline contexts edit the same note, reconnect, see the badge, pick a version.
- `./tests/run-all.sh` exits 0.
