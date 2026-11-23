# Server tooling proposals

Taken from the public repo [jarviswuod/improvedBillingSystem](https://github.com/jarviswuod/improvedBillingSystem). These are ideas to adopt later, as the Tracepad server grows. Nothing here is set up in the project yet.

The billing repo has no CI workflow. A pipeline is listed last, as something to add on top, not as part of the first setup.

## When the server folder exists

- **Maven wrapper.** `mvnw`, `mvnw.cmd`, and `.mvn/wrapper/maven-wrapper.properties`. The billing repo uses wrapper 3.3.4 and Maven 3.9.12, script only, so a global Maven install is not required.
- **Git line endings for the wrapper.** `.gitattributes` marks `mvnw` as LF and `*.cmd` as CRLF.
- **Git ignore for a Java server.** Ignore `target/`, the downloaded `maven-wrapper.jar`, and the usual IDE folders (IntelliJ `.idea`, Eclipse/STS `.settings`, NetBeans, VS Code `.vscode`).
- **Dockerfile.** Build the jar with Maven first, then copy `target/*.jar` into an Eclipse Temurin image and run it. The billing image is Temurin 17. Tracepad's server is Java 21, so the base image would be Temurin 21.
- **Docker Compose for local runs.** The billing compose file starts Postgres 16, Redis 7, and the app container, with health checks. Tracepad's plan is Postgres, Mailpit, and the server. Redis is part of the billing app, not of Tracepad.
- **Spring profiles.** `application.yaml`, plus `application-dev.yaml` and `application-prod.yaml`, so local and deployed settings stay apart.
- **HTTP scratch file.** `dashboard.http` holds hand-run requests for that API. A Tracepad equivalent would wait until the endpoints exist. Do not copy the billing requests.

## When tests start

- **JUnit through Spring Boot's test starter**, plus Spring Boot's Testcontainers support.
- **Testcontainers for Postgres**, version 2.0.5 in the billing `pom.xml`. One abstract base starts a Postgres container and checks the connection. A small `ApplicationTests` class loads the Spring context on top of it.
- **Mockito subclass mock maker.** `src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker` contains `mock-maker-subclass`.

## Maven plugins already in that pom

- **Compiler plugin**, with Lombok on the annotation-processor path.
- **Spring Boot plugin**, which builds the runnable jar and leaves Lombok out of the packaged app.
- **JaCoCo**, version 0.8.12, wired to run before tests and to write a report. Coverage is turned off there with `jacoco.skip`.

## Later, on top

- **CI.** The billing repo does not contain a workflow. Add one only after the server builds and tests on a machine. It would check out the repo, run the Maven wrapper test command, and nothing more until a deploy exists.
