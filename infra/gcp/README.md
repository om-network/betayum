# Betayum GCP Cloud Run Baseline

This directory contains the Terraform/OpenTofu baseline for deploying Betayum to
Cloud Run through Cloud Build.

The baseline is intentionally apply-gated. Project ownership, billing,
Terraform state, DNS ownership, and final IAM principal bindings must be
confirmed by an operator before any plan is applied.

## Environment Model

| Environment | Branch    | Approval  | Domain root           |
| ----------- | --------- | --------- | --------------------- |
| staging     | `develop` | automatic | `staging.betayum.com` |
| production  | `release` | required  | `betayum.com`         |

Staging and production should use separate GCP projects. Secret values are not
managed in Terraform; this baseline creates Secret Manager shells only. The
first apply keeps `mount_runtime_secrets = false` so Cloud Run services and the
migration job can be created before Secret Manager versions exist. The seed job
is created or updated by Cloud Build using the migration job runtime identity.

## What This Declares

- Required GCP APIs per environment.
- Artifact Registry repositories for immutable service images.
- Cloud Build deployer service accounts scoped per environment.
- Runtime service accounts for API, app, portal, and database jobs.
- Private Google Cloud Storage buckets for app data and device-agent artifacts.
- Secret Manager secret shells with environment-scoped names.
- Cloud Run services for API, app, and portal.
- A Cloud Run migration job plus Cloud Build substitutions for the seed job that
  runs before service rollout.
- Cloud SQL attachments and IAM client grants when an environment provides a
  `cloud_sql_instance_connection_name`.
- External HTTPS load balancer resources with managed certificates.
- Serverless NEGs and backend services with request logging enabled.
- Optional Cloud Armor attachment through `security_policy_id`.
- Cloud Build triggers for `develop` and `release`, with production approval.
- `_Default` log bucket retention for deployment evidence.

## Object Storage

Runtime object storage uses Google Cloud Storage and Application Default
Credentials. Cloud Run services authenticate with their attached service
accounts; do not seed long-lived GCS interoperability keys for production.

Each environment creates:

- One private app-data bucket exposed to services as
  `APP_OBJECT_STORAGE_BUCKET`.
- One private device-agent artifact bucket exposed as
  `APP_DEVICE_AGENT_ARTIFACTS_BUCKET`.

Customer-data objects must remain private and use organization-prefixed keys.
The API runtime service account receives object-admin access to the app-data
bucket. API and portal runtime service accounts receive read access to the
device-agent artifact bucket for download/proxy behavior. Runtime service
accounts are also granted `roles/iam.serviceAccountTokenCreator` on themselves
so the GCS client can mint V4 signed URLs through Application Default
Credentials.

Some app, portal, and API callers still use the S3-compatible GCS
interoperability helpers. Until those callers are migrated to the API object
storage adapter, seed `APP_GCP_ACCESS_KEY_ID` and `APP_GCP_SECRET_ACCESS_KEY`
secret values when `mount_runtime_secrets = true`; the baseline also wires the
matching `APP_GCP_*` bucket, endpoint, and region environment variables.

## Social Login Secrets

Better Auth social providers run in the API service. Seed these API-only Secret
Manager values when Google or Microsoft sign-in should be enabled:

- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_MICROSOFT_CLIENT_ID`
- `AUTH_MICROSOFT_CLIENT_SECRET`

`AUTH_MICROSOFT_TENANT_ID` defaults to `organizations` as a non-secret API
runtime environment variable. Change it to `common` only if personal Microsoft
accounts should also be allowed, or to a tenant GUID to restrict sign-in to one
Microsoft Entra tenant.

Do not mount provider client secrets into app or portal. Those frontends call
the API auth server through `NEXT_PUBLIC_API_URL`.

## Operator Inputs

Copy the example file and replace placeholders:

```bash
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars
```

Required decisions before `plan`:

- Staging and production project IDs.
- Billing and project ownership.
- OpenTofu/Terraform state backend.
- DNS zone owner for `betayum.com`.
- Optional reserved global edge IP addresses.
- Existing Cloud SQL instance connection names, if the environment uses Cloud
  SQL. The database instance lifecycle is intentionally external to this
  baseline unless the team decides Terraform should own it later.
- Optional custom GCS bucket names. If omitted, bucket names are derived from
  project ID, environment, and bucket purpose.
- Optional Cloud Armor security policy IDs.
- Final Cloud Build GitHub App connection authorization.

## Safe Workflow

Use OpenTofu or Terraform consistently for a workspace. Do not commit
`terraform.tfvars` or state files.

```bash
tofu init
tofu fmt -check
tofu validate
tofu plan -out staging-prod.plan
```

After review and approval:

```bash
tofu apply staging-prod.plan
```

Insert secret values after the Secret Manager shells exist, then set
`mount_runtime_secrets = true` and apply again to wire runtime revisions to the
`latest` secret versions. Cloud Run revisions will not be usable until required
secrets and Cloud Build substitutions are in place.

For Cloud SQL environments, set `DATABASE_URL` to use the mounted Unix socket,
for example:

```text
postgresql://USER:PASSWORD@localhost:5432/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE
```

For local object-storage development, use Application Default Credentials:

```bash
gcloud auth application-default login
```

When testing with a deployed service-account identity, prefer impersonation:

```bash
gcloud auth application-default login --impersonate-service-account SERVICE_ACCOUNT_EMAIL
```

## Browser VM Foundation

The organization browser-VM foundation is provisioned independently with
`gcloud`; it is not part of this directory's Terraform state. The provisioner
creates or updates:

- A custom-mode browser VPC and private subnet.
- Cloud Router and Cloud NAT for private VM package installation.
- Firewall access from the API network tag to private SSH and noVNC ports
  `22` and `6080`.
- IAP-only SSH access for troubleshooting.
- A private instance template that installs Chrome, FoxClocks, a pinned Codex
  CLI, and a restricted SSH account.
- A custom IAM role bound to the API runtime service account.
- Direct VPC egress and `BROWSER_VM_*` variables on the API Cloud Run service.

Run the validation and idempotent staging provisioner:

```bash
cd infra/gcp
node check-browser-vm.mjs
BETAYUM_GCP_PROJECT="centered-kiln-498405-h8" \
  ./provision-browser-vm-foundation.sh
```

Defaults target the `staging` environment in `us-central1` and
`us-central1-a`. Override them through `BETAYUM_ENVIRONMENT`,
`BETAYUM_GCP_REGION`, and `BETAYUM_GCP_ZONE`. Cloud Run is left unchanged by
default. Set `BETAYUM_CONFIGURE_CLOUD_RUN=true` only when the API is ready to
use the private network and organization VM template.

Creating the custom role requires `iam.roles.create`; binding it requires
permission to update the project's IAM policy. An operator without those
permissions can run with `BETAYUM_CONFIGURE_IAM=false`, then an IAM
administrator can rerun the default command to finish the role and binding
without creating an API revision.

The API creates one VM per organization from the resulting template. Those
instances have no external IP or service account. Their desktop path is:

```text
Browser noVNC client
  -> authenticated API WebSocket
  -> Cloud Run Direct VPC egress
  -> VM private-ip:6080
  -> x11vnc on VM localhost:5900

Betayum API
  -> authenticated Codex terminal WebSocket
  -> per-organization SSH key
  -> restricted SSH account on private-ip:22
  -> fixed Codex terminal, status, and logout commands
```

Codex credentials stay under `/var/lib/betayum-codex` on the VM. The API stores
an encrypted per-organization SSH private key and publishes only its public key
to instance metadata. The restricted account has no sudo access, forwarding,
general shell, or graphical desktop terminal.

For a standalone FoxClocks prototype instead, use `create-browser-vm.sh`.
Successful bootstrap writes `/var/lib/betayum-browser/foxclocks-ready` on the
VM.

### Local API testing

Run the local API with GCP Application Default Credentials and the staging
template:

```bash
export BROWSER_VM_GCP_PROJECT="centered-kiln-498405-h8"
export BROWSER_VM_GCP_ZONE="us-central1-a"
export BROWSER_VM_INSTANCE_TEMPLATE="projects/centered-kiln-498405-h8/global/instanceTemplates/TEMPLATE_PRINTED_BY_PROVISIONER"
export BROWSER_VM_LOCAL_VIEWER_URL="http://127.0.0.1:16080"
export BROWSER_VM_LOCAL_SSH_HOST="127.0.0.1"
export BROWSER_VM_LOCAL_SSH_PORT="16022"
export CODEX_AUTOMATION_API_BASE_URL="http://127.0.0.1:13333"
```

After the API creates an organization VM, open a second terminal and tunnel to
its private noVNC listener:

```bash
BETAYUM_GCP_PROJECT="centered-kiln-498405-h8" \
BETAYUM_BROWSER_VM_NAME="betayum-browser-INSTANCE_SUFFIX" \
  ./open-browser-vm-tunnel.sh
```

Keep the tunnel running while using the local app. The override is accepted
only outside `NODE_ENV=production` and only for loopback viewer and SSH
endpoints. Deployed environments continue to connect directly to the VM's
private address. The tunnel also exposes the local API on VM loopback port
`13333`, allowing the Codex worker to upload screenshots and complete runs
without making the developer API public.

The tunnel defaults to IAP. When the local account lacks IAP or external
organization OS Login access, use:

```bash
BETAYUM_GCP_PROJECT="centered-kiln-498405-h8" \
BETAYUM_BROWSER_VM_NAME="betayum-browser-INSTANCE_SUFFIX" \
BETAYUM_BROWSER_VM_TUNNEL_MODE="external" \
  ./open-browser-vm-tunnel.sh
```

External mode temporarily attaches an external IP and permits SSH only from
the workstation's current public `/32`. It removes the IP, firewall rule,
instance tag, and temporary firewall rule when the tunnel exits. noVNC and the
restricted Codex SSH endpoint remain available only through local port forwards
at `127.0.0.1:16080` and `127.0.0.1:16022`.

Upgrade an existing organization VM in place without replacing its persistent
Chrome or Codex data:

```bash
BETAYUM_GCP_PROJECT="centered-kiln-498405-h8" \
BETAYUM_BROWSER_VM_NAME="betayum-browser-INSTANCE_SUFFIX" \
  ./upgrade-browser-vm.sh
```

## Evidence

Capture these artifacts for ISO-oriented deployment records:

- Reviewed pull request for infrastructure changes.
- `tofu plan` output attached to the change record.
- Cloud Build trigger approval for production.
- Cloud Build build logs.
- Cloud Run migration and seed job execution logs.
- Cloud Run revision history for API, app, and portal.
- Load balancer request logs and certificate status.
