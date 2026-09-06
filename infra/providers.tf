provider "aws" {
  region = "ap-northeast-2"

  default_tags {
    tags = {
      Project   = "is-an-ai"
      ManagedBy = "terraform"
    }
  }
}

# Lambda@Edge and CloudFront ACM certs must be in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "is-an-ai"
      ManagedBy = "terraform"
    }
  }
}
