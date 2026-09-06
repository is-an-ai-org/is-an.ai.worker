# IAM role for API Lambda
resource "aws_iam_role" "api_lambda" {
  name = "is-an-ai-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "api_lambda" {
  name = "is-an-ai-api-lambda-policy"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
          "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          "${aws_dynamodb_table.users.arn}/index/*",
          aws_dynamodb_table.subdomains.arn,
          "${aws_dynamodb_table.subdomains.arn}/index/*",
          aws_dynamodb_table.auth_state.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket",
        ]
        Resource = [
          aws_s3_bucket.sites.arn,
          "${aws_s3_bucket.sites.arn}/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.app_secrets.arn]
      },
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name = "is-an-ai-api"
  role          = aws_iam_role.api_lambda.arn
  handler       = "lambda.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  filename         = "${path.module}/../dist/api-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/api-lambda.zip")

  environment {
    variables = {
      ENV_TYPE                   = "prod"
      APP_URL                    = "https://${var.api_subdomain}.${var.domain}"
      FRONTEND_URL               = "https://${var.domain}"
      JWT_EXPIRES_IN             = "120h"
      GITHUB_REDIRECT_URI        = "https://${var.api_subdomain}.${var.domain}/v1/user/auth/github/callback"
      GITHUB_CLIENT_ID           = var.github_client_id
      GITHUB_APP_CLIENT_ID       = var.github_app_client_id
      GITHUB_APP_INSTALLATION_ID = var.github_app_installation_id
      GITHUB_PAT                 = var.github_pat
      GITHUB_OWNER               = "is-an-ai-org"
      GITHUB_REPO                = "is-an.ai"
      GITHUB_BOT_NAME            = "is-an-ai-org-bot[bot]"
      GITHUB_BOT_EMAIL           = "323575661+is-an-ai-org-bot[bot]@users.noreply.github.com"
      DYNAMODB_USERS_TABLE       = aws_dynamodb_table.users.name
      DYNAMODB_SUBDOMAINS_TABLE  = aws_dynamodb_table.subdomains.name
      DYNAMODB_AUTH_STATE_TABLE  = aws_dynamodb_table.auth_state.name
      S3_SITES_BUCKET            = aws_s3_bucket.sites.bucket
      S3_REGION                  = "ap-northeast-2"
      SECRETS_ARN                = aws_secretsmanager_secret.app_secrets.arn
    }
  }
}

# Lambda function URL (fallback, API Gateway is primary)
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}
