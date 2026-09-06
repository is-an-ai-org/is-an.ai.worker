resource "aws_secretsmanager_secret" "app_secrets" {
  name = "is-an-ai/app-secrets"
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id

  secret_string = jsonencode({
    GITHUB_APP_SECRET  = var.github_app_secret
    JWT_PRIVATE_KEY    = var.jwt_private_key
    JWT_PUBLIC_KEY     = var.jwt_public_key
    GITHUB_CLIENT_SECRET = var.github_client_secret
    ADMIN_API_KEY      = var.admin_api_key
  })
}
