# ACM certificate for api.is-an.ai (ap-northeast-2, for API Gateway)
resource "aws_acm_certificate" "api" {
  domain_name       = "${var.api_subdomain}.${var.domain}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# ACM certificate for *.is-an.ai (us-east-1, required for CloudFront)
resource "aws_acm_certificate" "hosting" {
  provider          = aws.us_east_1
  domain_name       = "*.${var.domain}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}
