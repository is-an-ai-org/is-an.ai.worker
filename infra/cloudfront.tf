# Lambda@Edge for hosting (must be in us-east-1)
resource "aws_iam_role" "hosting_lambda_edge" {
  provider = aws.us_east_1
  name     = "is-an-ai-hosting-lambda-edge"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = ["lambda.amazonaws.com", "edgelambda.amazonaws.com"]
      }
    }]
  })
}

resource "aws_iam_role_policy" "hosting_lambda_edge" {
  provider = aws.us_east_1
  name     = "is-an-ai-hosting-lambda-edge-policy"
  role     = aws_iam_role.hosting_lambda_edge.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:HeadObject"]
        Resource = "${aws_s3_bucket.sites.arn}/*"
      },
    ]
  })
}

resource "aws_lambda_function" "hosting_edge" {
  provider      = aws.us_east_1
  function_name = "is-an-ai-hosting-edge"
  role          = aws_iam_role.hosting_lambda_edge.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 128
  publish       = true # Lambda@Edge requires published versions

  filename         = "${path.module}/../dist/hosting-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/hosting-lambda.zip")
}

resource "aws_lambda_function" "hosting_edge_response" {
  provider      = aws.us_east_1
  function_name = "is-an-ai-hosting-edge-response"
  role          = aws_iam_role.hosting_lambda_edge.arn
  handler       = "origin-response.handler"
  runtime       = "nodejs20.x"
  timeout       = 5
  memory_size   = 128
  publish       = true

  filename         = "${path.module}/../dist/hosting-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/hosting-lambda.zip")
}

# CloudFront OAC
resource "aws_cloudfront_origin_access_control" "sites" {
  name                              = "is-an-ai-sites-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution
resource "aws_cloudfront_distribution" "hosting" {
  enabled         = true
  is_ipv6_enabled = true
  aliases         = ["*.${var.domain}"]
  comment         = "is-an.ai hosting"

  origin {
    domain_name              = aws_s3_bucket.sites.bucket_regional_domain_name
    origin_id                = "s3-sites"
    origin_access_control_id = aws_cloudfront_origin_access_control.sites.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-sites"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      headers      = ["Host"]

      cookies {
        forward = "none"
      }
    }

    lambda_function_association {
      event_type   = "origin-request"
      lambda_arn   = aws_lambda_function.hosting_edge.qualified_arn
      include_body = false
    }

    lambda_function_association {
      event_type   = "origin-response"
      lambda_arn   = aws_lambda_function.hosting_edge_response.qualified_arn
      include_body = false
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.hosting.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
