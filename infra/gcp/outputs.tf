output "artifact_repositories" {
  description = "Artifact Registry repositories by environment."
  value = {
    for env_name, repo in google_artifact_registry_repository.services : env_name => {
      project  = repo.project
      location = repo.location
      name     = repo.repository_id
    }
  }
}

output "cloud_run_services" {
  description = "Cloud Run service names and managed domains."
  value = {
    for key, service in google_cloud_run_v2_service.services : key => {
      project  = service.project
      region   = service.location
      name     = service.name
      uri      = service.uri
      hostname = local.env_services[key].domain
    }
  }
}

output "migrator_jobs" {
  description = "Migration Cloud Run jobs by environment."
  value = {
    for env_name, job in google_cloud_run_v2_job.migrator : env_name => {
      project = job.project
      region  = job.location
      name    = job.name
    }
  }
}

output "seeder_jobs" {
  description = "Seed Cloud Run jobs by environment."
  value = {
    for env_name, job in google_cloud_run_v2_job.seeder : env_name => {
      project = job.project
      region  = job.location
      name    = job.name
    }
  }
}

output "edge_forwarding_rules" {
  description = "Managed HTTPS edge forwarding rule names."
  value = {
    for env_name, rule in google_compute_global_forwarding_rule.https : env_name => {
      project    = rule.project
      name       = rule.name
      ip_address = rule.ip_address
    }
  }
}

output "cloudbuild_triggers" {
  description = "Cloud Build deploy triggers by environment."
  value = {
    for env_name, trigger in google_cloudbuild_trigger.deploy : env_name => {
      project           = trigger.project
      location          = trigger.location
      name              = trigger.name
      approval_required = var.environments[env_name].approval_required
      branch_name       = var.environments[env_name].branch_name
    }
  }
}

output "object_storage_buckets" {
  description = "GCS buckets used by first-party object storage."
  value = {
    for env_name in keys(var.environments) : env_name => {
      app_data_bucket               = google_storage_bucket.app_data[env_name].name
      device_agent_artifacts_bucket = google_storage_bucket.device_agent_artifacts[env_name].name
    }
  }
}
