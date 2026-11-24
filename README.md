# Tracepad

Offline-first notes that keep every version of every note. Notes are saved on the device first and sync to a server when one is available. This repository has three parts. They meet only through the API contract in `contract/`.

## Web

React and TypeScript, built with Vite. From `web/`:

```bash
npm install
npm run dev
```

The app is at http://localhost:5173. It runs with no account and no connection. `npm test` runs Vitest. `npm run e2e` runs Playwright.

## Server

Java 21 and Spring Boot, built with Maven. From the repository root, Docker Compose starts Postgres, Mailpit, and the server:

```bash
docker compose up
```

Tests need Docker running: `cd server && ./mvnw verify`.

## Android

Kotlin and Jetpack Compose. Open the `android/` folder in Android Studio and run it on an emulator.

On the machine, `cd android && ./gradlew test` runs the JUnit and Room in-memory tests. `./gradlew connectedAndroidTest` runs the emulator tests.

## Tests

From the repository root, `./tests/run-all.sh` runs the tests of every part that exists so far.
