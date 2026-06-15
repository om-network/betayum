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
    project_id         = string
    region             = string
    branch_name        = string
    approval_required  = bool
    artifact_location  = optional(string)
    log_retention_days = optional(number, 365)
    security_policy_id = optional(string)
    edge_ip_address    = optional(string)
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
      "tsconfig.json",
      "turbo.json",
    ])
    domains = object({
      api    = string
      app    = string
      portal = string
    })
  }))
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
  })
  default = {
    api      = "us-docker.pkg.dev/cloudrun/container/hello"
    app      = "us-docker.pkg.dev/cloudrun/container/hello"
    portal   = "us-docker.pkg.dev/cloudrun/container/hello"
    migrator = "us-docker.pkg.dev/cloudrun/container/hello"
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
    "resend-api-key",
    "trigger-secret-key",
    "revalidation-secret",
    "upstash-redis-rest-url",
    "upstash-redis-rest-token",
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
      "resend-api-key",
      "upstash-redis-rest-url",
      "upstash-redis-rest-token",
    ]
    app = [
      "database-url",
      "auth-secret",
      "resend-api-key",
      "trigger-secret-key",
      "revalidation-secret",
    ]
    portal = [
      "database-url",
      "better-auth-secret",
      "resend-api-key",
    ]
    migrator = [
      "database-url",
    ]
  }
}
