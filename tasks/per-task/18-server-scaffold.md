# 18 · Server scaffold

**Goal:** Set up `server/` as a Spring Boot Maven project with Postgres, Flyway and Testcontainers. The first migration creates the whole schema. Add `docker-compose.yml` for Postgres, Mailpit and the server.

**Spec:** Flow §1 (server stack) and §17 (`server/` layout). Schema: every server table and index, as `V1__init.sql`.

**Model:** Claude Opus 5.5. The migration must match the schema exactly.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 1 and 17 of docs/Tracepad-Full-Flow.md, and all of docs/Tracepad-Schema.md.
Do task 18 from tasks/roadmap.md: the server scaffold.
- server/ with Maven wrapper, Java 21, Spring Boot (web, security, data JPA, validation, mail), Flyway, Postgres, Testcontainers. Packages from section 17.
- src/main/resources/db/migration/V1__init.sql: the server tables and indexes from the schema, exactly. Leave out the payments table (v2).
- application.yaml, a Dockerfile, and a root docker-compose.yml (Postgres, Mailpit, server).
- One Testcontainers test that starts the app and runs the migration.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- `cd server && ./mvnw verify` passes, including a test that checks every schema table exists after the migration.
- `docker compose up` starts all three services.
- `./tests/run-all.sh` exits 0.
