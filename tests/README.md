# Tests

Run the full test suite from the repository root with:

```bash
./tests/run-all.sh
```

It checks the repository skeleton (`tests/repo-skeleton.sh`), then runs the tests of every part that exists so far and stops at the first failure. Parts that haven't been created yet are skipped.

| Part       | What runs                                      | Needs                         |
| ---------- | ---------------------------------------------- | ----------------------------- |
| `web/`     | Type-check (`npm run typecheck`), Vitest (`npm test`), then Playwright (`npm run e2e`) | Node, Playwright browsers |
| `server/`  | JUnit 5 + Testcontainers (`./mvnw verify`)     | Java 21, Docker running       |
| `android/` | JUnit + Room in-memory tests (`./gradlew test`) | Android SDK                  |

The test code itself lives inside each part, as laid out in section 17 of `docs/Tracepad-Full-Flow.md`: `web/src` and `web/e2e`, `server/src/test`, and `android/app/src/test`. Shared JSON fixtures live in `contract/fixtures/`.

Android emulator tests (`./gradlew connectedAndroidTest`) aren't part of this command, because they need a running emulator. Run them separately when a task touches Android screens or alarms.
