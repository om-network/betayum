mock_provider "google" {}

run "production_shares_staging_trigger_vm" {
  command = plan

  variables {
    environments = {
      staging = {
        project_id                         = "centered-kiln-498405-h8"
        region                             = "us-central1"
        branch_name                        = "develop"
        approval_required                  = false
        cloud_sql_instance_connection_name = "centered-kiln-498405-h8:us-central1:betayum-db"
        domains = {
          api    = "api.staging.betayum.com"
          app    = "app.staging.betayum.com"
          portal = "portal.staging.betayum.com"
        }
      }
      production = {
        project_id                         = "centered-kiln-498405-h8"
        region                             = "us-central1"
        branch_name                        = "release"
        approval_required                  = true
        trigger_host_environment           = "staging"
        public_dns_ready                   = false
        cloud_sql_instance_connection_name = "centered-kiln-498405-h8:us-central1:betayum-db"
        domains = {
          api    = "api.betayum.com"
          app    = "app.betayum.com"
          portal = "portal.betayum.com"
        }
      }
    }
  }

  assert {
    condition     = length(google_compute_instance.trigger) == 1
    error_message = "Production must not provision a second Trigger VM."
  }

  assert {
    condition     = google_cloudbuild_trigger.deploy["production"].substitutions["_TRIGGER_VM"] == google_compute_instance.trigger["staging"].name
    error_message = "Production must deploy tasks to the staging-owned Trigger VM."
  }

  assert {
    condition     = google_cloudbuild_trigger.deploy["production"].substitutions["_PUBLIC_DNS_READY"] == "false"
    error_message = "Production public smoke checks must wait until DNS is configured."
  }

  assert {
    condition = (
      contains(keys(local.trigger_secret_bindings), "production.trigger-project-id") &&
      contains(keys(local.trigger_secret_bindings), "production.trigger-task-database-url") &&
      !contains(keys(local.trigger_secret_bindings), "production.trigger-registry-password")
    )
    error_message = "The shared VM needs production task credentials, not a second registry password."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.services) == 6
    error_message = "Production must have its own API, app, and portal services."
  }

  assert {
    condition     = length(google_compute_backend_service.trigger) == 1
    error_message = "Production must reuse the staging Trigger backend."
  }
}
