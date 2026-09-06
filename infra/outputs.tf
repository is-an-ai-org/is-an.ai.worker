output "api_gateway_url" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "api_gateway_domain_target" {
  description = "CNAME target for api.is-an.ai"
  value       = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
}

output "cloudfront_domain" {
  description = "CNAME target for *.is-an.ai hosting"
  value       = aws_cloudfront_distribution.hosting.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.hosting.id
}

output "s3_bucket" {
  description = "S3 bucket name for sites"
  value       = aws_s3_bucket.sites.bucket
}

output "lambda_function_url" {
  description = "Lambda function URL (direct)"
  value       = aws_lambda_function_url.api.function_url
}

output "acm_api_validation_records" {
  description = "DNS records to add for API certificate validation"
  value = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

output "acm_hosting_validation_records" {
  description = "DNS records to add for hosting certificate validation"
  value = {
    for dvo in aws_acm_certificate.hosting.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}
