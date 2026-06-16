resource "google_cloudbuild_trigger" "deploy" {
  for_each = var.environments

  project         = each.value.project_id
  location        = each.value.region
  name            = "betayum-${each.key}-cloud-run"
  description     = "Build and deploy Betayum ${each.key} to Cloud Run"
  filename        = "cloudbuild.yaml"
  included_files  = try(each.value.cloudbuild_included_files, ["**"])
  service_account = google_service_account.deployer[each.key].id

  repository_event_config {
    repository = "projects/${each.value.project_id}/locations/${each.value.region}/connections/betayum-github/repositories/${var.repository.name}"

    push {
      branch = "^${each.value.branch_name}$"
    }
  }

  approval_config {
    approval_required = each.value.approval_required
  }

  substitutions = {
    _ENVIRONMENT                   = each.key
    _REGION                        = each.value.region
    _ARTIFACT_REPOSITORY           = google_artifact_registry_repository.services[each.key].repository_id
    _API_SERVICE                   = google_cloud_run_v2_service.services["${each.key}.api"].name
    _APP_SERVICE                   = google_cloud_run_v2_service.services["${each.key}.app"].name
    _PORTAL_SERVICE                = google_cloud_run_v2_service.services["${each.key}.portal"].name
    _MIGRATOR_JOB                  = google_cloud_run_v2_job.migrator[each.key].name
    _SEEDER_JOB                    = google_cloud_run_v2_job.seeder[each.key].name
    _CLOUD_SQL_INSTANCE            = coalesce(try(each.value.cloud_sql_instance_connection_name, null), "")
    _API_URL                       = "https://${each.value.domains.api}"
    _APP_URL                       = "https://${each.value.domains.app}"
    _PORTAL_URL                    = "https://${each.value.domains.portal}"
    _AUTH_PRIMARY_DOMAIN           = var.auth_primary_domain
    _AUTH_STAGING_DOMAIN           = var.auth_staging_domain
    _APP_DATA_BUCKET               = google_storage_bucket.app_data[each.key].name
    _DEVICE_AGENT_ARTIFACTS_BUCKET = google_storage_bucket.device_agent_artifacts[each.key].name
  }
}
