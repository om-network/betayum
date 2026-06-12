# Betayum GCP Cloud Run Baseline

This directory contains the Terraform/OpenTofu baseline for deploying Betayum to
Cloud Run through Cloud Build.

The baseline is intentionally apply-gated. Project ownership, billing,
Terraform state, DNS ownership, and final IAM principal bindings must be
confirmed by an operator before any plan is applied.

## Environment Model

| Environment | Branch | Approval | Domain root |
|-------------|--------|----------|-------------|
| staging | `develop` | automatic | `staging.betayum.com` |
| production | `release` | required | `betayum.com` |

Staging and production should use separate GCP projects. Secret values are not
managed in Terraform; this baseline creates Secret Manager shells only.

## What This Declares

- Required GCP APIs per environment.
- Artifact Registry repositories for immutable service images.
- Cloud Build deployer service accounts scoped per environment.
- Runtime service accounts for API, app, portal, and migration jobs.
- Secret Manager secret shells with environment-scoped names.
- Cloud Run services for API, app, and portal.
- A Cloud Run migration job that Cloud Build runs before service rollout.
- External HTTPS load balancer resources with managed certificates.
- Serverless NEGs and backend services with request logging enabled.
- Optional Cloud Armor attachment through `security_policy_id`.
- Cloud Build triggers for `develop` and `release`, with production approval.
- `_Default` log bucket retention for deployment evidence.

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

Insert secret values after the Secret Manager shells exist. Cloud Run revisions
will not be usable until required secrets and Cloud Build substitutions are in
place.

## Evidence

Capture these artifacts for ISO-oriented deployment records:

- Reviewed pull request for infrastructure changes.
- `tofu plan` output attached to the change record.
- Cloud Build trigger approval for production.
- Cloud Build build logs.
- Cloud Run migration job execution logs.
- Cloud Run revision history for API, app, and portal.
- Load balancer request logs and certificate status.
