FROM oven/bun:1.3.4-alpine@sha256:1d653098bf847813e26adb2435f932b7cfa3c132a7e25dd5216dbb1f67dbd118

RUN apk add --no-cache docker-cli docker-cli-buildx git

USER root
WORKDIR /workspace
