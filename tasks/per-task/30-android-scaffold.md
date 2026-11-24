# 30 · Android scaffold

**Goal:** Set up `android/` with Jetpack Compose, a Room database matching the schema, and a Retrofit client generated from the API contract.

**Spec:** Flow §1 (Android stack) and §17 (`android/` layout). Schema: device copies of the note tables, `outbox`, `local_sync_state`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 1 and 17 of docs/Tracepad-Full-Flow.md, docs/Tracepad-Schema.md (sections 3 to 6 and 8), and contract/openapi.yaml.
Do task 30 from tasks/roadmap.md: android/.
- A Gradle Kotlin DSL project with gradle/libs.versions.toml, Compose, Compose Navigation, Room, Retrofit + OkHttp + kotlinx.serialization, WorkManager, DataStore.
- The packages from section 17. Room entities and DAOs matching the schema's device tables, with schema export on.
- A Retrofit API generated from contract/openapi.yaml.
- MainActivity showing an empty board.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- `cd android && ./gradlew test` passes, including a Room in-memory test that inserts and reads every entity.
- The app builds and launches on the emulator.
- `./tests/run-all.sh` exits 0.
