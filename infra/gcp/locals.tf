locals {
  required_apis = toset([
    "artifactregistry.googleapis.com",
    "certificatemanager.googleapis.com",
    "cloudbuild.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
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
          security_policy_id = try(env.security_policy_id, null)
        }
      ]
    ]) : item.key => item
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
          env_name         = env_service.env_name
          project_id       = env_service.project_id
          secret_key       = "${env_service.env_name}.${secret_name}"
        }
      ]
    ]) : item.key => item
  }

  migrator_jobs = {
    for env_name, env in var.environments : env_name => {
      name       = "betayum-${env_name}-migrator"
      project_id = env.project_id
      region     = env.region
      image      = var.initial_images.migrator
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
    "roles/logging.viewer",
    "roles/run.admin",
    "roles/secretmanager.secretAccessor",
  ])
}
