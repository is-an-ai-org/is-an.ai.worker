# is-an.ai API

The API runs on AWS Lambda behind API Gateway in `ap-northeast-2`.
The repository name is historical; it is not a Cloudflare Worker deployment.

| Component | Implementation |
|---|---|
| API | `src/lambda.ts` → Hono, Lambda `is-an-ai-api` |
| Users, domains, OAuth state | DynamoDB (`src/adapters/aws.ts`) |
| Site uploads | S3 presigned URLs |
| Site serving | CloudFront + Lambda@Edge (`hosting-lambda/`, `us-east-1`) |
| Secrets | AWS Secrets Manager |
| DNS changes | `is-an-ai-org/is-an.ai` → GitHub Actions → PowerDNS |

## Build and test

```sh
npm ci
npm run typecheck
npm test
```

Tests use synthetic Lambda events and mocked AWS/GitHub clients. They do not
read production credentials or modify cloud resources.

`npm run build` creates `dist/api-lambda.zip` and `dist/hosting-lambda.zip`.
Dependencies are bundled in the ZIPs.

## Deployment

For an API code update, use an authenticated AWS CLI session for the intended account:

```sh
npm run deploy
```

This updates the API function code only. It does not update Lambda environment
variables, Secrets Manager, Lambda@Edge versions, or CloudFront associations.

Infrastructure is defined in `infra/`. Before applying infrastructure changes,
use the existing Terraform state and review the plan. Creating a new empty state
does not adopt the running resources.

GitHub organization settings belong in the API Lambda environment. GitHub App
credentials and JWT keys must belong to the current deployment. See
[the organization migration guide](docs/ORG-MIGRATION.md).

The `drizzle/` files describe the former D1 schema and are retained as historical
reference. They are not used by the AWS runtime. The separate `hosting-worker`
repository is also the former Cloudflare implementation.
