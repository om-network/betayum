resource "google_project_service" "required" {
  for_each = {
    for item in flatten([
      for env_name, env in var.environments : [
        for api in local.required_apis : {
          key        = "${env_name}.${api}"
          project_id = env.project_id
          api        = api
        }
      ]
    ]) : item.key => item
  }

  project            = each.value.project_id
  service            = each.value.api
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "services" {
  for_each = var.environments

  project       = each.value.project_id
  location      = coalesce(try(each.value.artifact_location, null), each.value.region)
  repository_id = "betayum-${each.key}"
  description   = "Betayum ${each.key} Cloud Run service images"
  format        = "DOCKER"

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "secrets" {
  for_each = local.secret_shells

  project   = each.value.project_id
  secret_id = each.value.secret_name

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_logging_project_bucket_config" "default" {
  for_each = var.environments

  project        = each.value.project_id
  location       = "global"
  bucket_id      = "_Default"
  retention_days = try(each.value.log_retention_days, 365)

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service" "services" {
  for_each = local.env_services

  project             = each.value.project_id
  name                = each.value.cloud_run_name
  location            = each.value.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = true

  template {
    service_account = google_service_account.runtime[each.key].email

    containers {
      image = each.value.image

      ports {
        container_port = each.value.port
      }

      dynamic "env" {
        for_each = each.value.env_vars

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.mount_runtime_secrets ? toset(lookup(var.runtime_secret_names, each.value.service_name, [])) : toset([])

        content {
          name = upper(replace(env.value, "-", "_"))
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["${each.value.env_name}.${env.value}"].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  for_each = local.env_services

  project  = each.value.project_id
  location = each.value.region
  name     = google_cloud_run_v2_service.services[each.key].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_job" "migrator" {
  for_each = local.migrator_jobs

  project             = each.value.project_id
  name                = each.value.name
  location            = each.value.region
  deletion_protection = true

  template {
    template {
      service_account = google_service_account.migrator[each.key].email

      containers {
        image = each.value.image

        dynamic "env" {
          for_each = each.value.env_vars

          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = var.mount_runtime_secrets ? toset(lookup(var.runtime_secret_names, "migrator", [])) : toset([])

          content {
            name = upper(replace(env.value, "-", "_"))
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.secrets["${each.key}.${env.value}"].secret_id
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  depends_on = [google_project_service.required]
}
