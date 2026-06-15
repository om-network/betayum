resource "google_compute_managed_ssl_certificate" "edge" {
  for_each = var.environments

  project = each.value.project_id
  name    = "betayum-${each.key}-edge"

  managed {
    domains = [
      each.value.domains.api,
      each.value.domains.app,
      each.value.domains.portal,
    ]
  }

  depends_on = [google_project_service.required]
}

resource "google_compute_region_network_endpoint_group" "serverless" {
  for_each = local.env_services

  project               = each.value.project_id
  name                  = "${each.value.cloud_run_name}-neg"
  network_endpoint_type = "SERVERLESS"
  region                = each.value.region

  cloud_run {
    service = google_cloud_run_v2_service.services[each.key].name
  }
}

resource "google_compute_backend_service" "service_backends" {
  for_each = local.env_services

  project               = each.value.project_id
  name                  = "${each.value.cloud_run_name}-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = each.value.security_policy_id

  backend {
    group = google_compute_region_network_endpoint_group.serverless[each.key].id
  }

  log_config {
    enable      = true
    sample_rate = 1
  }
}

resource "google_compute_url_map" "edge" {
  for_each = var.environments

  project         = each.value.project_id
  name            = "betayum-${each.key}-edge"
  default_service = google_compute_backend_service.service_backends["${each.key}.app"].id

  host_rule {
    hosts        = [each.value.domains.api]
    path_matcher = "api"
  }

  host_rule {
    hosts        = [each.value.domains.app]
    path_matcher = "app"
  }

  host_rule {
    hosts        = [each.value.domains.portal]
    path_matcher = "portal"
  }

  path_matcher {
    name            = "api"
    default_service = google_compute_backend_service.service_backends["${each.key}.api"].id
  }

  path_matcher {
    name            = "app"
    default_service = google_compute_backend_service.service_backends["${each.key}.app"].id
  }

  path_matcher {
    name            = "portal"
    default_service = google_compute_backend_service.service_backends["${each.key}.portal"].id
  }
}

resource "google_compute_target_https_proxy" "edge" {
  for_each = var.environments

  project          = each.value.project_id
  name             = "betayum-${each.key}-https"
  url_map          = google_compute_url_map.edge[each.key].id
  ssl_certificates = [google_compute_managed_ssl_certificate.edge[each.key].id]
}

resource "google_compute_global_forwarding_rule" "https" {
  for_each = var.environments

  project               = each.value.project_id
  name                  = "betayum-${each.key}-https"
  ip_address            = try(each.value.edge_ip_address, null)
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.edge[each.key].id
}
