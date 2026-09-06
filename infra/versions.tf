terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # TODO: migrate to S3 backend once credentials are sorted
  # backend "s3" {
  #   bucket = "is-an-ai-terraform-state"
  #   key    = "infra/terraform.tfstate"
  #   region = "ap-northeast-2"
  # }
}
