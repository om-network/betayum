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

resource "google_compute_managed_ssl_certificate" "trigger" {
  for_each = local.trigger_hosts

  project = each.value.project_id
  name    = "betayum-${each.key}-trigger"

  managed {
    domains = [each.value.domain]
  }

  depends_on = [google_project_service.required]
}

resource "google_compute_global_address" "edge" {
  for_each = var.environments

  project = each.value.project_id
  name    = "betayum-${each.key}-edge"
  address = try(each.value.edge_ip_address, null)
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

resource "google_compute_health_check" "trigger" {
  for_each = local.trigger_hosts

  project             = each.value.project_id
  name                = "betayum-${each.key}-trigger"
  check_interval_sec  = 30
  timeout_sec         = 10
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = 8030
    request_path = "/healthcheck"
  }
}

resource "google_compute_backend_service" "trigger" {
  for_each = local.trigger_hosts

  project               = each.value.project_id
  name                  = "betayum-${each.key}-trigger-backend"
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 3600
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = try(var.environments[each.key].security_policy_id, null)
  health_checks         = [google_compute_health_check.trigger[each.key].id]

  backend {
    group           = google_compute_instance_group.trigger[each.key].id
    balancing_mode  = "UTILIZATION"
    max_utilization = 0.8
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

  dynamic "host_rule" {
    for_each = contains(keys(local.trigger_hosts), each.key) ? [1] : []
    content {
      hosts        = [local.trigger_hosts[each.key].domain]
      path_matcher = "trigger"
    }
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

  dynamic "path_matcher" {
    for_each = contains(keys(local.trigger_hosts), each.key) ? [1] : []
    content {
      name            = "trigger"
      default_service = google_compute_backend_service.trigger[each.key].id
    }
  }
}

resource "google_compute_target_https_proxy" "edge" {
  for_each = var.environments

  project = each.value.project_id
  name    = "betayum-${each.key}-https"
  url_map = google_compute_url_map.edge[each.key].id
  ssl_certificates = concat(
    [google_compute_managed_ssl_certificate.edge[each.key].id],
    contains(keys(local.trigger_hosts), each.key) ? [google_compute_managed_ssl_certificate.trigger[each.key].id] : [],
  )
}

resource "google_compute_url_map" "http_redirect" {
  for_each = var.environments

  project = each.value.project_id
  name    = "betayum-${each.key}-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }

  host_rule {
    hosts        = ["*"]
    path_matcher = "redirect"
  }

  path_matcher {
    name = "redirect"

    default_url_redirect {
      https_redirect         = true
      redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
      strip_query            = false
    }
  }
}

resource "google_compute_target_http_proxy" "http_redirect" {
  for_each = var.environments

  project = each.value.project_id
  name    = "betayum-${each.key}-http-redirect"
  url_map = google_compute_url_map.http_redirect[each.key].id
}

resource "google_compute_global_forwarding_rule" "https" {
  for_each = var.environments

  project               = each.value.project_id
  name                  = "betayum-${each.key}-https"
  ip_address            = google_compute_global_address.edge[each.key].address
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.edge[each.key].id
}

resource "google_compute_global_forwarding_rule" "http" {
  for_each = var.environments

  project               = each.value.project_id
  name                  = "betayum-${each.key}-http"
  ip_address            = google_compute_global_address.edge[each.key].address
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "80"
  target                = google_compute_target_http_proxy.http_redirect[each.key].id
}
