locals {
  required_apis = toset([
    "artifactregistry.googleapis.com",
    "certificatemanager.googleapis.com",
    "cloudasset.googleapis.com",
    "cloudbuild.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "iap.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
  ])

  services = {
    api = {
      port = 3333
    }
    app = {
      port = 3000
    }
    portal = {
      port = 3000
    }
  }

  trigger_host_owner = {
    for env_name, env in var.environments : env_name => coalesce(try(env.trigger_host_environment, null), env_name)
  }

  project_owner = {
    for project_id in toset([for env in values(var.environments) : env.project_id]) : project_id =>
    contains([for env_name, env in var.environments : env_name if env.project_id == project_id], "staging")
    ? "staging"
    : sort([for env_name, env in var.environments : env_name if env.project_id == project_id])[0]
  }

  trigger_hosts = {
    for env_name, env in var.environments : env_name => {
      project_id = env.project_id
      region     = env.region
      zone       = coalesce(try(env.trigger_zone, null), "${env.region}-a")
      domain = coalesce(
        try(env.trigger_domain, null),
        replace(env.domains.app, "app.", "trigger."),
      )
      machine_type = try(env.trigger_machine_type, "e2-standard-4")
      disk_size_gb = try(env.trigger_disk_size_gb, 100)
      subnet_cidr  = try(env.trigger_subnet_cidr, "10.30.0.0/24")
    } if local.trigger_host_owner[env_name] == env_name
  }

  env_services = {
    for item in flatten([
      for env_name, env in var.environments : [
        for service_name, service in local.services : {
          key                = "${env_name}.${service_name}"
          env_name           = env_name
          service_name       = service_name
          cloud_run_name     = "betayum-${env_name}-${service_name}"
          project_id         = env.project_id
          region             = env.region
          port               = service.port
          image              = var.initial_images[service_name]
          domain             = env.domains[service_name]
          env_vars           = local.runtime_env_vars[env_name][service_name]
          security_policy_id = try(env.security_policy_id, null)
          cloud_sql_instance_connection_name = try(
            env.cloud_sql_instance_connection_name,
            null,
          )
        }
      ]
    ]) : item.key => item
  }

  runtime_env_vars = {
    for env_name, env in var.environments : env_name => {
      api = {
        BASE_URL                          = "https://${env.domains.api}"
        NEXT_PUBLIC_API_URL               = "https://${env.domains.api}"
        NEXT_PUBLIC_BETTER_AUTH_URL       = "https://${env.domains.api}"
        NEXT_PUBLIC_PORTAL_URL            = "https://${env.domains.portal}"
        AUTH_PRIMARY_DOMAIN               = var.auth_primary_domain
        AUTH_STAGING_DOMAIN               = var.auth_staging_domain
        AUTH_MICROSOFT_TENANT_ID          = "organizations"
        CODEX_AUTOMATION_API_BASE_URL     = "https://${env.domains.api}"
        BETAYUM_LOGO_URL                  = "https://${env.domains.app}/brand/betayum-icon-color.png"
        APP_OBJECT_STORAGE_BUCKET         = local.object_storage_buckets[env_name].app_data
        APP_DEVICE_AGENT_ARTIFACTS_BUCKET = local.object_storage_buckets[env_name].device_agent_artifacts
        APP_GCP_BUCKET_NAME               = local.object_storage_buckets[env_name].app_data
        APP_GCP_ENDPOINT                  = "https://storage.googleapis.com"
        APP_GCP_REGION                    = "auto"
        APP_GCP_ORG_ASSETS_BUCKET         = local.object_storage_buckets[env_name].app_data
      }
      app = {
        NEXT_PUBLIC_API_URL                 = "https://${env.domains.api}"
        NEXT_PUBLIC_BETTER_AUTH_URL         = "https://${env.domains.api}"
        NEXT_PUBLIC_PORTAL_URL              = "https://${env.domains.portal}"
        APP_OBJECT_STORAGE_BUCKET           = local.object_storage_buckets[env_name].app_data
        APP_GCP_BUCKET_NAME                 = local.object_storage_buckets[env_name].app_data
        APP_GCP_ENDPOINT                    = "https://storage.googleapis.com"
        APP_GCP_REGION                      = "auto"
        APP_GCP_QUESTIONNAIRE_UPLOAD_BUCKET = local.object_storage_buckets[env_name].app_data
        APP_GCP_KNOWLEDGE_BASE_BUCKET       = local.object_storage_buckets[env_name].app_data
        APP_GCP_ORG_ASSETS_BUCKET           = local.object_storage_buckets[env_name].app_data
      }
      portal = {
        NEXT_PUBLIC_API_URL               = "https://${env.domains.api}"
        NEXT_PUBLIC_BETTER_AUTH_URL       = "https://${env.domains.api}"
        APP_OBJECT_STORAGE_BUCKET         = local.object_storage_buckets[env_name].app_data
        APP_DEVICE_AGENT_ARTIFACTS_BUCKET = local.object_storage_buckets[env_name].device_agent_artifacts
        APP_GCP_BUCKET_NAME               = local.object_storage_buckets[env_name].app_data
        APP_GCP_ENDPOINT                  = "https://storage.googleapis.com"
        APP_GCP_REGION                    = "auto"
        APP_GCP_ORG_ASSETS_BUCKET         = local.object_storage_buckets[env_name].app_data
        FLEET_AGENT_BUCKET_NAME           = local.object_storage_buckets[env_name].device_agent_artifacts
      }
    }
  }

  object_storage_buckets = {
    for env_name, env in var.environments : env_name => {
      app_data = coalesce(
        try(env.app_data_bucket_name, null),
        "betayum-${env_name}-app-data",
      )
      device_agent_artifacts = coalesce(
        try(env.device_agent_artifacts_bucket_name, null),
        "betayum-${env_name}-device-agent-artifacts",
      )
    }
  }

  secret_shells = {
    for item in flatten([
      for env_name, env in var.environments : [
        for secret_name in var.secret_names : {
          key         = "${env_name}.${secret_name}"
          env_name    = env_name
          project_id  = env.project_id
          secret_name = "betayum-${env_name}-${secret_name}"
        }
      ]
    ]) : item.key => item
  }

  runtime_secret_bindings = {
    for item in flatten([
      for env_service_key, env_service in local.env_services : [
        for secret_name in lookup(var.runtime_secret_names, env_service.service_name, []) : {
          key             = "${env_service_key}.${secret_name}"
          env_service_key = env_service_key
          env_name        = env_service.env_name
          project_id      = env_service.project_id
          secret_key      = "${env_service.env_name}.${secret_name}"
        }
      ]
    ]) : item.key => item
  }

  trigger_secret_bindings = {
    for item in flatten([
      for env_name, env in var.environments : [
        for secret_name in var.trigger_runtime_secret_names : {
          key              = "${env_name}.${secret_name}"
          env_name         = env_name
          host_environment = local.trigger_host_owner[env_name]
          project_id       = env.project_id
          secret_key       = "${env_name}.${secret_name}"
          } if local.trigger_host_owner[env_name] == env_name || contains([
            "trigger-access-token",
            "trigger-project-id",
            "trigger-task-database-url",
            "service-token-trigger",
            "secret-key",
            "auth-secret",
            "encryption-key",
            "resend-api-key",
            "openai-api-key",
            "anthropic-api-key",
            "groq-api-key",
            "firecrawl-api-key",
            "novu-api-key",
            "revalidation-secret",
            "upstash-redis-rest-url",
            "upstash-redis-rest-token",
            "app-gcp-access-key-id",
            "app-gcp-secret-access-key",
        ], secret_name)
      ]
    ]) : item.key => item
  }

  migrator_jobs = {
    for env_name, env in var.environments : env_name => {
      name       = "betayum-${env_name}-migrator"
      project_id = env.project_id
      region     = env.region
      image      = var.initial_images.migrator
      cloud_sql_instance_connection_name = try(
        env.cloud_sql_instance_connection_name,
        null,
      )
      env_vars = {
        BASE_URL            = "https://${env.domains.api}"
        AUTH_PRIMARY_DOMAIN = var.auth_primary_domain
        AUTH_STAGING_DOMAIN = var.auth_staging_domain
      }
    }
  }

  migrator_secret_bindings = {
    for item in flatten([
      for env_name, env in var.environments : [
        for secret_name in lookup(var.runtime_secret_names, "migrator", []) : {
          key        = "${env_name}.${secret_name}"
          env_name   = env_name
          project_id = env.project_id
          secret_key = "${env_name}.${secret_name}"
        }
      ]
    ]) : item.key => item
  }

  deployer_project_roles = toset([
    "roles/artifactregistry.writer",
    "roles/logging.logWriter",
    "roles/logging.viewer",
    "roles/run.admin",
    "roles/cloudsql.client",
    "roles/compute.osAdminLogin",
    "roles/compute.networkUser",
    "roles/compute.viewer",
    "roles/iap.tunnelResourceAccessor",
  ])
}
