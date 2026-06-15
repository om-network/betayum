# Cloud Run Docker Contracts

Betayum ships four Cloud Run artifacts:

| Artifact | Dockerfile | Target | Cloud Run port | Smoke check |
|----------|------------|--------|----------------|-------------|
| API | `apps/api/Dockerfile.multistage` | `production` | `3333` | `/v1/health` |
| App | `Dockerfile` | `app` | `3000` | `/api/health` |
| Portal | `Dockerfile` | `portal` | `3000` | `/` |
| Migrator | `Dockerfile` | `migrator` | n/a | job exit code |

Cloud Run services in `infra/gcp/services.tf` are configured to match these
ports, so the images do not need to listen on the default Cloud Run `8080`.

## Local Build Verification

Use immutable tags in CI. Locally, set `COMMIT_SHA` to any stable value:

```bash
export COMMIT_SHA="$(git rev-parse --short HEAD)"
export REGISTRY="us-central1-docker.pkg.dev/betayum-staging-project-id/betayum-staging"
export APP_URL="https://app.staging.betayum.com"
export API_URL="https://api.staging.betayum.com"
export PORTAL_URL="https://portal.staging.betayum.com"
```

Build the API image:

```bash
docker build -f apps/api/Dockerfile.multistage \
  --target production \
  -t "$REGISTRY/api:$COMMIT_SHA" .
```

Build the app image:

```bash
docker build -f Dockerfile --target app \
  --build-arg NEXT_PUBLIC_BETTER_AUTH_URL="$API_URL" \
  --build-arg NEXT_PUBLIC_API_URL="$API_URL" \
  --build-arg NEXT_PUBLIC_PORTAL_URL="$PORTAL_URL" \
  -t "$REGISTRY/app:$COMMIT_SHA" .
```

Build the portal image:

```bash
docker build -f Dockerfile --target portal \
  --build-arg NEXT_PUBLIC_BETTER_AUTH_URL="$API_URL" \
  --build-arg NEXT_PUBLIC_API_URL="$API_URL" \
  -t "$REGISTRY/portal:$COMMIT_SHA" .
```

Build the migrator image:

```bash
docker build -f Dockerfile --target migrator \
  -t "$REGISTRY/migrator:$COMMIT_SHA" .
```

## Runtime Configuration

Runtime secrets are injected from Secret Manager by Cloud Run. Do not bake env
files or secret values into images.

Required public build values:

- `NEXT_PUBLIC_BETTER_AUTH_URL`: API auth URL.
- `NEXT_PUBLIC_API_URL`: API URL used by app and portal clients.
- `NEXT_PUBLIC_PORTAL_URL`: portal URL used by the app.

Required runtime values are declared as Secret Manager shells in
`infra/gcp/variables.tf`. The migration job only needs `DATABASE_URL` at runtime.

## Smoke Checks

After deployment, run checks through the managed edge:

```bash
curl --fail "$API_URL/v1/health"
curl --fail "$APP_URL/api/health"
curl --fail "$PORTAL_URL/"
```

For the migrator, treat a non-zero Cloud Run Job execution as a failed deploy.
