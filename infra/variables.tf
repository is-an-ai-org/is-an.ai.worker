variable "domain" {
  description = "Base domain"
  type        = string
  default     = "is-an.ai"
}

variable "api_subdomain" {
  description = "API subdomain"
  type        = string
  default     = "api"
}

variable "github_client_id" {
  type      = string
  sensitive = true
}

variable "github_client_secret" {
  type      = string
  sensitive = true
}

variable "github_app_secret" {
  type      = string
  sensitive = true
}

variable "github_app_client_id" {
  type      = string
  sensitive = true
}

variable "github_app_installation_id" {
  type      = string
  sensitive = true
}

variable "github_pat" {
  type      = string
  sensitive = true
}

variable "jwt_private_key" {
  type      = string
  sensitive = true
}

variable "jwt_public_key" {
  type      = string
  sensitive = true
}

variable "admin_api_key" {
  type      = string
  sensitive = true
}
