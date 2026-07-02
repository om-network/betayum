resource "google_service_account" "deployer" {
  for_each = var.environments

  project      = each.value.project_id
  account_id   = "betayum-${each.key}-deployer"
  display_name = "Betayum ${each.key} Cloud Build deployer"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "runtime" {
  for_each = local.env_services

  project      = each.value.project_id
  account_id   = "betayum-${each.value.env_name}-${each.value.service_name}"
  display_name = "Betayum ${each.value.env_name} ${each.value.service_name} runtime"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "migrator" {
  for_each = var.environments

  project      = each.value.project_id
  account_id   = "betayum-${each.key}-migrator"
  display_name = "Betayum ${each.key} migration job runtime"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "evidence_reader" {
  for_each = {
    for env_name, env in var.environments : env_name => env
    if env_name == "staging" && env.project_id == "centered-kiln-498405-h8"
  }

  project      = each.value.project_id
  account_id   = "betayum-evidence-reader"
  display_name = "Betayum Evidence Reader"

  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "deployer_project_roles" {
  for_each = {
    for item in flatten([
      for env_name, env in var.environments : [
        for role in local.deployer_project_roles : {
          key        = "${env_name}.${role}"
          env_name   = env_name
          project_id = env.project_id
          role       = role
        }
      ]
    ]) : item.key => item
  }

  project = each.value.project_id
  role    = each.value.role
  member  = google_service_account.deployer[each.value.env_name].member
}

resource "google_service_account_iam_member" "deployer_can_run_services" {
  for_each = local.env_services

  service_account_id = google_service_account.runtime[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer[each.value.env_name].member
}

resource "google_service_account_iam_member" "deployer_can_run_migrator" {
  for_each = var.environments

  service_account_id = google_service_account.migrator[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer[each.key].member
}

resource "google_service_account_iam_member" "runtime_can_sign_blobs" {
  for_each = local.env_services

  service_account_id = google_service_account.runtime[each.key].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = google_service_account.runtime[each.key].member
}

resource "google_secret_manager_secret_iam_member" "runtime_secret_access" {
  for_each = local.runtime_secret_bindings

  project   = each.value.project_id
  secret_id = google_secret_manager_secret.secrets[each.value.secret_key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime[each.value.env_service_key].member
}

resource "google_secret_manager_secret_iam_member" "migrator_secret_access" {
  for_each = local.migrator_secret_bindings

  project   = each.value.project_id
  secret_id = google_secret_manager_secret.secrets[each.value.secret_key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.migrator[each.value.env_name].member
}

resource "google_project_iam_member" "runtime_cloud_sql_client" {
  for_each = {
    for key, service in local.env_services : key => service
    if service.cloud_sql_instance_connection_name != null
  }

  project = each.value.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.runtime[each.key].member
}

resource "google_project_iam_member" "migrator_cloud_sql_client" {
  for_each = {
    for key, job in local.migrator_jobs : key => job
    if job.cloud_sql_instance_connection_name != null
  }

  project = each.value.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.migrator[each.key].member
}

locals {
  staging_evidence_reader_project_roles = toset([
    "roles/viewer",
    "roles/cloudasset.viewer",
    "roles/logging.viewer",
    "roles/monitoring.viewer",
  ])
}

resource "google_project_iam_member" "staging_evidence_reader_project_roles" {
  for_each = {
    for item in flatten([
      for env_name, env in var.environments : [
        for role in local.staging_evidence_reader_project_roles : {
          key        = "${env_name}.${role}"
          env_name   = env_name
          project_id = env.project_id
          role       = role
        }
      ] if env_name == "staging" && env.project_id == "centered-kiln-498405-h8"
    ]) : item.key => item
  }

  project = each.value.project_id
  role    = each.value.role
  member  = google_service_account.evidence_reader[each.value.env_name].member
}

resource "google_storage_bucket_iam_member" "api_app_data_object_admin" {
  for_each = var.environments

  bucket = google_storage_bucket.app_data[each.key].name
  role   = "roles/storage.objectAdmin"
  member = google_service_account.runtime["${each.key}.api"].member
}

resource "google_storage_bucket_iam_member" "api_device_agent_object_viewer" {
  for_each = var.environments

  bucket = google_storage_bucket.device_agent_artifacts[each.key].name
  role   = "roles/storage.objectViewer"
  member = google_service_account.runtime["${each.key}.api"].member
}

resource "google_storage_bucket_iam_member" "portal_device_agent_object_viewer" {
  for_each = var.environments

  bucket = google_storage_bucket.device_agent_artifacts[each.key].name
  role   = "roles/storage.objectViewer"
  member = google_service_account.runtime["${each.key}.portal"].member
}
