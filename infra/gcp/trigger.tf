resource "google_compute_network" "trigger" {
  for_each = local.trigger_hosts

  project                 = each.value.project_id
  name                    = "betayum-${each.key}-trigger"
  auto_create_subnetworks = false

  depends_on = [google_project_service.required]
}

resource "google_compute_subnetwork" "trigger" {
  for_each = local.trigger_hosts

  project                  = each.value.project_id
  name                     = "betayum-${each.key}-trigger"
  region                   = each.value.region
  network                  = google_compute_network.trigger[each.key].id
  ip_cidr_range            = each.value.subnet_cidr
  private_ip_google_access = true
}

resource "google_compute_router" "trigger" {
  for_each = local.trigger_hosts

  project = each.value.project_id
  name    = "betayum-${each.key}-trigger"
  region  = each.value.region
  network = google_compute_network.trigger[each.key].id
}

resource "google_compute_router_nat" "trigger" {
  for_each = local.trigger_hosts

  project                            = each.value.project_id
  name                               = "betayum-${each.key}-trigger"
  region                             = each.value.region
  router                             = google_compute_router.trigger[each.key].name
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  subnetwork {
    name                    = google_compute_subnetwork.trigger[each.key].id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }
}

resource "google_service_account" "trigger" {
  for_each = local.trigger_hosts

  project      = each.value.project_id
  account_id   = "betayum-${each.key}-trigger"
  display_name = "Betayum ${each.key} Trigger.dev runtime"

  depends_on = [google_project_service.required]
}

resource "google_compute_firewall" "trigger_iap_ssh" {
  for_each = local.trigger_hosts

  project   = each.value.project_id
  name      = "betayum-${each.key}-trigger-iap-ssh"
  network   = google_compute_network.trigger[each.key].name
  direction = "INGRESS"

  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["betayum-trigger"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "trigger_health_check" {
  for_each = local.trigger_hosts

  project   = each.value.project_id
  name      = "betayum-${each.key}-trigger-health-check"
  network   = google_compute_network.trigger[each.key].name
  direction = "INGRESS"

  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["betayum-trigger"]

  allow {
    protocol = "tcp"
    ports    = ["8030"]
  }
}

resource "google_compute_instance" "trigger" {
  for_each = local.trigger_hosts

  project                   = each.value.project_id
  name                      = "betayum-${each.key}-trigger"
  zone                      = each.value.zone
  machine_type              = each.value.machine_type
  allow_stopping_for_update = true
  deletion_protection       = true
  tags                      = ["betayum-trigger"]

  labels = {
    component   = "trigger-dev"
    environment = each.key
  }

  boot_disk {
    initialize_params {
      image = "projects/ubuntu-os-cloud/global/images/family/ubuntu-minimal-2404-lts-amd64"
      size  = each.value.disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.trigger[each.key].id
  }

  service_account {
    email  = google_service_account.trigger[each.key].email
    scopes = ["cloud-platform"]
  }

  metadata = {
    enable-oslogin                = "TRUE"
    block-project-ssh-keys        = "TRUE"
    betayum-environment           = each.key
    trigger-origin                = "https://${each.value.domain}"
    api-url                       = "https://${var.environments[each.key].domains.api}"
    app-url                       = "https://${var.environments[each.key].domains.app}"
    portal-url                    = "https://${var.environments[each.key].domains.portal}"
    app-data-bucket               = google_storage_bucket.app_data[each.key].name
    cloud-sql-instance            = coalesce(try(var.environments[each.key].cloud_sql_instance_connection_name, null), "")
    trigger-compose               = base64encode(file("${path.module}/trigger/compose.yaml"))
    trigger-clickhouse-data-paths = base64encode(file("${path.module}/trigger/clickhouse/data-paths.xml"))
    trigger-clickhouse-override   = base64encode(file("${path.module}/trigger/clickhouse/override.xml"))
    trigger-clickhouse-users      = base64encode(file("${path.module}/trigger/clickhouse/users-override.xml"))
    trigger-secret-helper         = base64encode(file("${path.module}/trigger/secret-env.sh"))
    trigger-deploy-script         = base64encode(file("${path.module}/trigger/deploy.sh"))
  }

  metadata_startup_script = file("${path.module}/trigger/startup.sh")

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    provisioning_model  = "STANDARD"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  depends_on = [
    google_compute_router_nat.trigger,
    google_secret_manager_secret_iam_member.trigger_secret_access,
  ]
}

resource "google_compute_instance_group" "trigger" {
  for_each = local.trigger_hosts

  project   = each.value.project_id
  name      = "betayum-${each.key}-trigger"
  zone      = each.value.zone
  instances = [google_compute_instance.trigger[each.key].self_link]

  named_port {
    name = "http"
    port = 8030
  }
}
