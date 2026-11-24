# 27 · Draft sync

**Goal:** Sync each device's drafts so other devices see "Laptop is editing" with the live text, read-only, and drafts disappear everywhere once they become a version.

**Spec:** Flow §8 (subsection "Draft sync"). Schema: `drafts` (key: note and device), `devices.name`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, section 8 of docs/Tracepad-Full-Flow.md, and the drafts and devices tables in docs/Tracepad-Schema.md.
Do task 27 from tasks/roadmap.md: draft sync.
- Drafts sync per device (key: note_id + device_id). Never overwrite another device's draft.
- If another device has a draft for the open note, show "<Device> is editing" with its text, read-only.
- When a device leaves the note, its draft becomes a version and is deleted everywhere.
- A draft that never became a version stays visible elsewhere as "unsaved draft from <Device>". Only its own device can turn it into a version.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Server tests: drafts from two devices for one note both survive; deleting one leaves the other.
- A Playwright test with two contexts: one types, the other sees "is editing"; leave, and the draft turns into a version on both.
- `./tests/run-all.sh` exits 0.
