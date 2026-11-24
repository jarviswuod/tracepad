# 21 · Forgot password and delete account

**Goal:** Send a one-time password-reset link (through Mailpit locally) that logs out every device. Let users delete their account as a soft delete.

**Spec:** Flow §5 (rows "Forgot password" and "Delete account") and §16 (row "Account deleted"). Schema: `password_reset_tokens`, `users.deleted_at`, `refresh_tokens`.

**Model:** Claude Sonnet 5.5.

**Prompt:**

```text
Read AGENTS.md, brief.md, sections 5 and 16 of docs/Tracepad-Full-Flow.md, and the users, password_reset_tokens and refresh_tokens tables in docs/Tracepad-Schema.md.
Do task 21 from tasks/roadmap.md.
- Forgot password: email a one-time, expiring link through Spring Mail (Mailpit locally). Store only the token hash. Setting a new password revokes every refresh token.
- Delete account: ask for the password, set users.deleted_at (never remove the row), revoke every refresh token, and log out. Other devices log out on their next sync.
- Web screens for both.
Always write tests for the feature you're building, before or alongside the code. Then run ./tests/run-all.sh; every test must pass. Report.
```

**Done when:**
- Server tests: the reset email is sent, a token works once, an expired token fails, a reset revokes sessions; deleting soft-deletes and revokes.
- Web tests for both screens.
- `./tests/run-all.sh` exits 0.
