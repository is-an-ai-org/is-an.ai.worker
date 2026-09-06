resource "aws_dynamodb_table" "users" {
  name         = "is-an-ai-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "providerId"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "provider-index"
    hash_key        = "providerId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "subdomains" {
  name         = "is-an-ai-subdomains"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "nameLower"
    type = "S"
  }

  attribute {
    name = "ownerId"
    type = "S"
  }

  global_secondary_index {
    name            = "name-index"
    hash_key        = "nameLower"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "owner-index"
    hash_key        = "ownerId"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "auth_state" {
  name         = "is-an-ai-auth-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "stateKey"

  attribute {
    name = "stateKey"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}
