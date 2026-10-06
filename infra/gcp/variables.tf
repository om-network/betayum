variable "repository" {
  description = "GitHub repository that Cloud Build triggers watch."
  type = object({
    owner = string
    name  = string
  })

  default = {
    owner = "om-network"
    name  = "betayum"
  }
}

variable "environments" {
  description = "Staging and production deployment inputs. Project IDs must already exist."
  type = map(object({
    project_id                         = string
    region                             = string
    branch_name                        = string
    approval_required                  = bool
    artifact_location                  = optional(string)
    log_retention_days                 = optional(number, 365)
    security_policy_id                 = optional(string)
    edge_ip_address                    = optional(string)
    app_data_bucket_name               = optional(string)
    device_agent_artifacts_bucket_name = optional(string)
    cloud_sql_instance_connection_name = optional(string)
    stripe_publishable_key             = optional(string, "")
    trigger_domain                     = optional(string)
    trigger_host_environment           = optional(string)
    trigger_zone                       = optional(string)
    trigger_machine_type               = optional(string, "e2-standard-4")
    trigger_disk_size_gb               = optional(number, 100)
    trigger_subnet_cidr                = optional(string, "10.30.0.0/24")
    cloudbuild_included_files = optional(list(string), [
      ".dockerignore",
      "apps/**",
      "bun.lock",
      "bunfig.toml",
      "package.json",
      "packages/**",
      "Dockerfile",
      "apps/api/Dockerfile.multistage",
      "cloudbuild.yaml",
      "infra/gcp/**",
      "scripts/deploy-trigger-tasks-gce.sh",
      "tsconfig.json",
      "turbo.json",
    ])
    public_dns_ready = optional(bool, true)
    domains = object({
      api    = string
      app    = string
      portal = string
    })
  }))

  validation {
    condition = alltrue([
      for env_name, env in var.environments :
      try(env.trigger_host_environment, null) == null || (
        contains(keys(var.environments), env.trigger_host_environment) &&
        env.project_id == try(var.environments[env.trigger_host_environment].project_id, "") &&
        env.region == try(var.environments[env.trigger_host_environment].region, "")
      )
    ])
    error_message = "A shared Trigger host must name an environment in the same GCP project and region."
  }
}

variable "object_storage_force_destroy" {
  description = "Allow Terraform to delete non-empty object storage buckets. Keep false for shared environments."
  type        = bool
  default     = false
}

variable "auth_primary_domain" {
  description = "Primary cookie/CORS root domain used by the API auth server."
  type        = string
  default     = "betayum.com"
}

variable "auth_staging_domain" {
  description = "Staging cookie/CORS root domain used by the API auth server."
  type        = string
  default     = "staging.betayum.com"
}

variable "mount_runtime_secrets" {
  description = "Mount Secret Manager latest versions after operators seed initial secret values."
  type        = bool
  default     = false
}

variable "initial_images" {
  description = "Bootstrap images used before the first Cloud Build rollout replaces revisions."
  type = object({
    api      = string
    app      = string
    portal   = string
    migrator = string
    seeder   = optional(string)
  })
  default = {
    api      = "us-docker.pkg.dev/cloudrun/container/hello"
    app      = "us-docker.pkg.dev/cloudrun/container/hello"
    portal   = "us-docker.pkg.dev/cloudrun/container/hello"
    migrator = "us-docker.pkg.dev/cloudrun/container/hello"
    seeder   = "us-docker.pkg.dev/cloudrun/container/hello"
  }
}

variable "secret_names" {
  description = "Secret Manager shells created per environment. Values are inserted outside Terraform."
  type        = list(string)
  default = [
    "database-url",
    "secret-key",
    "auth-secret",
    "better-auth-secret",
    "better-auth-api-key",
    "auth-google-id",
    "auth-google-secret",
    "auth-microsoft-client-id",
    "auth-microsoft-client-secret",
    "resend-api-key",
    "trigger-secret-key",
    "trigger-access-token",
    "trigger-project-id",
    "trigger-postgres-password",
    "trigger-clickhouse-password",
    "trigger-session-secret",
    "trigger-magic-link-secret",
    "trigger-encryption-key",
    "trigger-provider-secret",
    "trigger-coordinator-secret",
    "trigger-managed-worker-secret",
    "trigger-registry-password",
    "trigger-object-store-secret-access-key",
    "trigger-task-database-url",
    "service-token-trigger",
    "openai-api-key",
    "anthropic-api-key",
    "groq-api-key",
    "firecrawl-api-key",
    "novu-api-key",
    "encryption-key",
    "revalidation-secret",
    "upstash-redis-rest-url",
    "upstash-redis-rest-token",
    "app-gcp-access-key-id",
    "app-gcp-secret-access-key",
    "stripe-secret-key",
    "stripe-webhook-secret",
  ]
}

variable "trigger_runtime_secret_names" {
  description = "Secret shells the self-hosted Trigger.dev platform and task builder may read."
  type        = list(string)
  default = [
    "database-url",
    "secret-key",
    "auth-secret",
    "resend-api-key",
    "trigger-secret-key",
    "trigger-access-token",
    "trigger-project-id",
    "trigger-postgres-password",
    "trigger-clickhouse-password",
    "trigger-session-secret",
    "trigger-magic-link-secret",
    "trigger-encryption-key",
    "trigger-provider-secret",
    "trigger-coordinator-secret",
    "trigger-managed-worker-secret",
    "trigger-registry-password",
    "trigger-object-store-secret-access-key",
    "trigger-task-database-url",
    "service-token-trigger",
    "openai-api-key",
    "anthropic-api-key",
    "groq-api-key",
    "firecrawl-api-key",
    "novu-api-key",
    "encryption-key",
    "revalidation-secret",
    "upstash-redis-rest-url",
    "upstash-redis-rest-token",
    "app-gcp-access-key-id",
    "app-gcp-secret-access-key",
  ]
}

variable "runtime_secret_names" {
  description = "Secret shells mounted into each runtime service and migration job."
  type        = map(list(string))
  default = {
    api = [
      "database-url",
      "secret-key",
      "auth-secret",
      "better-auth-api-key",
      "service-token-trigger",
      "encryption-key",
      "auth-google-id",
      "auth-google-secret",
      "auth-microsoft-client-id",
      "auth-microsoft-client-secret",
      "resend-api-key",
      "upstash-redis-rest-url",
      "upstash-redis-rest-token",
      "app-gcp-access-key-id",
      "app-gcp-secret-access-key",
      "stripe-secret-key",
      "stripe-webhook-secret",
    ]
    app = [
      "database-url",
      "auth-secret",
      "resend-api-key",
      "trigger-secret-key",
      "service-token-trigger",
      "openai-api-key",
      "revalidation-secret",
      "app-gcp-access-key-id",
      "app-gcp-secret-access-key",
    ]
    portal = [
      "database-url",
      "better-auth-secret",
      "resend-api-key",
      "app-gcp-access-key-id",
      "app-gcp-secret-access-key",
    ]
    migrator = [
      "database-url",
    ]
  }
}
