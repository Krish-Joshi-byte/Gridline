# Render has no native Java runtime, so the backend deploys as a Docker
# image. Multi-stage build: compile with Maven, run on a slim JRE.

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
# Cache dependencies separately so code-only changes don't re-download the internet
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

# Render sets $PORT and routes traffic to it; application.properties
# already reads server.port=${PORT:3001}, so no extra config is needed.
EXPOSE 3001
ENTRYPOINT ["java", "-jar", "app.jar"]
