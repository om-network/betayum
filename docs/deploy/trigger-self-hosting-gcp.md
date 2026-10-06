# Trigger.dev Self-Hosting on Google Cloud

Betayum runs the Trigger.dev v4.5.9 control plane and task supervisor on one
private Compute Engine VM. Cloud Run continues to host the API, app, and portal.
Cloud Build deploys the consolidated task project to the VM through IAP.

This is intentionally a single-host deployment. It is inexpensive and keeps the
Docker socket, registry, PostgreSQL, Redis, ClickHouse, Electric, and MinIO off
the public network, but it is not highly available. Snapshot the VM boot disk
before platform upgrades and use GKE if task availability requires multiple
worker nodes.

Production can share this VM and control plane with staging. Give production a
separate Trigger.dev project, environment secret key, task database, and
Secret Manager values; the deploy script selects the environment passed by
Cloud Build instead of reading the VM's staging metadata for task configuration.
The shared Docker registry still uses the staging host's registry password;
production does not need a second platform registry password.
Do not create a second VM or copy staging task credentials into production.
Both projects stop when this VM is stopped.

## Topology

```text
shared Trigger URL -> existing HTTPS load balancer -> VM:8030
Cloud Build -> IAP SSH -> VM deploy script -> private registry -> supervisor
Cloud Run API/app -> trigger URL + environment secret key
```

The VM has no external IP. Cloud NAT provides outbound image pulls. Firewall
rules admit only IAP SSH and Google load-balancer health/proxy traffic. The
registry on port 5000 is reachable only from the host and its task containers.

## Bootstrap

1. Set `trigger_domain`, `trigger_zone`, and optionally
   `trigger_machine_type` in `infra/gcp/terraform.tfvars`. The default machine is
   `e2-standard-4`; lowering it is likely to starve ClickHouse or task runners.
2. Apply Terraform once. The VM startup will wait for required secret versions
   and can initially fail safely.
3. Add one unique, hexadecimal value to each platform secret:
   - `trigger-postgres-password`
   - `trigger-clickhouse-password`
   - `trigger-session-secret`
   - `trigger-magic-link-secret`
   - `trigger-encryption-key`
   - `trigger-provider-secret`
   - `trigger-coordinator-secret`
   - `trigger-managed-worker-secret`
   - `trigger-registry-password`
   - `trigger-object-store-secret-access-key`

   Secret resource names are prefixed with `betayum-ENVIRONMENT-`. Generate
   values without writing them to disk:

   ```bash
   openssl rand -hex 32 \
     | gcloud secrets versions add SECRET_RESOURCE_NAME --data-file=-
   ```

4. Restart the VM so its startup script reads the new versions:

   ```bash
   gcloud compute instances reset betayum-ENVIRONMENT-trigger \
     --project=PROJECT_ID --zone=ZONE
   ```

5. Point the Trigger domain DNS record at the `edge_forwarding_rules` IP. Wait
   for the dedicated managed certificate to become active.
6. Use IAP SSH to inspect the webapp logs and retrieve the initial magic link:

   ```bash
   gcloud compute ssh betayum-ENVIRONMENT-trigger \
     --project=PROJECT_ID --zone=ZONE --tunnel-through-iap \
     --command='sudo /var/lib/betayum-trigger/bin/docker-compose -f /var/lib/betayum-trigger/compose.yaml logs webapp'
   ```

7. In the self-hosted dashboard, create the Betayum project and a personal
   access token. Add these values to Secret Manager:
   - `trigger-project-id`: the `proj_...` project reference.
   - `trigger-access-token`: the personal access token used by Cloud Build.
   - `trigger-secret-key`: the production environment key used by API/app.

8. Add `trigger-task-database-url`. It must use the same database credentials as
   Betayum but connect through `cloud-sql-proxy:5432`, for example:

   ```text
   postgresql://USER:PERCENT_ENCODED_PASSWORD@cloud-sql-proxy:5432/DATABASE
   ```

9. Seed task secrets used in that environment, including OpenAI, Anthropic,
   Groq, Firecrawl, Novu, Resend, Upstash, and GCS interoperability
   credentials. The task builder skips optional secrets that have no version;
   Cloud Run secrets referenced in `cloudbuild.yaml` still need versions before
   a service can deploy.
10. Run the environment Cloud Build trigger. It builds the compact
    `deployer.Dockerfile`, transfers source over IAP, deploys tasks to the local
    Trigger registry, and then rolls out Cloud Run with `TRIGGER_API_URL` and
    `TRIGGER_SECRET_KEY` pointing at the self-hosted project.

## Environment Ownership

Secret Manager is authoritative for task runtime values. The deploy script reads
an explicit allowlist, and `apps/app/trigger.config.ts` syncs those values into
Trigger.dev. Sensitive values are marked secret and remain redacted in the
dashboard. `TRIGGER_ACCESS_TOKEN` is available only to the short-lived deployer
container; product services receive only the environment secret key.

Dedicated GitHub task-deployment workflows are intentionally removed. Do not
re-enable them alongside Cloud Build, because two deployments could promote
different task images for the same commit.

## Operations

Check platform health and worker state:

```bash
gcloud compute ssh betayum-ENVIRONMENT-trigger \
  --project=PROJECT_ID --zone=ZONE --tunnel-through-iap \
  --command='sudo /var/lib/betayum-trigger/bin/docker-compose -f /var/lib/betayum-trigger/compose.yaml ps'
```

All platform images are pinned by version and digest. Upgrade the Trigger.dev
webapp, supervisor, CLI, and SDK together. Never update only one component.
