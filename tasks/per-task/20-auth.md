# 20 · Register, login, refresh, logout

**Goal:** Add accounts: register, log in, quietly renew short access tokens with a refresh cookie, and log out, with the safeguards the spec lists.

**Spec:** Flow §4 (register) and §5 (login, logout, sessions). Schema: `users`, `devices`, `refresh_tokens`.

**Model:** Claude Opus 5.5. This is security-sensitive.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 4 and 5 of docs/Tracepad-Full-Flow.md, the users, devices and refresh_tokens tables in docs/Tracepad-Schema.md, and contract/openapi.yaml.
Do task 20 from tasks/roadmap.md.
- Server: register (BCrypt, unique email, 409 if taken), login (vague error, Bucket4j rate limit), JWT access token of about 15 minutes, refresh token of about 30 days in an httpOnly cookie (stored hashed), logout (revoke). Register the device on login.
- Web: register and login screens with form checks, the access token kept in memory, quiet refresh, and the logout warning when changes haven't synced.
Email verification is not in version 1. Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Server tests (Testcontainers): register, duplicate email 409, wrong password, rate limit, refresh, logout revokes.
- Web tests: form validation, quiet refresh on a 401, logout warning with pending outbox rows.
- `./tests/run-all.sh` exits 0.
