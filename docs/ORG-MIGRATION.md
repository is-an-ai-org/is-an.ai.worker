# GitHub 조직 이전 설정

운영 API는 AWS Lambda다. 조직 이전은 Lambda의 GitHub 설정을 변경하는 작업이다.
Cloudflare Worker 배포나 D1 변경으로 운영 API를 갱신할 수 없다.

## 유지해야 할 AWS 구성

- API Gateway → Lambda `is-an-ai-api` (`ap-northeast-2`)
- DynamoDB: 사용자·도메인·OAuth 임시 상태
- S3 + CloudFront + Lambda@Edge: 사이트 업로드·서빙
- Secrets Manager: GitHub App 키·OAuth secret·JWT 키·관리자 API 키

## 새 조직 설정

`infra/lambda.tf`의 Lambda 환경변수:

| 변수 | 값 |
|---|---|
| `GITHUB_OWNER` | `is-an-ai-org` |
| `GITHUB_REPO` | `is-an.ai` |
| `GITHUB_BOT_NAME` | `is-an-ai-org-bot[bot]` |
| `GITHUB_BOT_EMAIL` | `323575661+is-an-ai-org-bot[bot]@users.noreply.github.com` |

`GITHUB_APP_CLIENT_ID`와 `GITHUB_APP_INSTALLATION_ID`는 새 GitHub App의 값이어야 한다.
Terraform은 각각 `github_app_client_id`, `github_app_installation_id`에서 읽는다.
App private key는 `github_app_secret`을 통해 Secrets Manager에 저장한다.
값은 추측하거나 이전 App의 값으로 덮어쓰지 않는다.

초기화 미들웨어는 Lambda 환경변수와 Secrets Manager 값을 읽은 뒤
`Github.configure(c.env)`를 호출한다. 모든 GitHub 읽기·쓰기에 같은 조직 설정을 사용한다.

JWT 키와 DynamoDB 사용자 ID는 유지한다. 조직 이전 때문에 사용자 소유권이나
로그인 세션을 초기화할 필요는 없다.

## 히스토리와 코드 복원

새 조직은 과거 Git 히스토리를 제외한 스냅샷으로 생성됐다.
이때 Cloudflare 코드가 들어왔고 기존 AWS 구현이 누락됐다.
AWS 구현은 `feat/aws-migration`의 `31083a7`을 기준으로 복원했다.
새 조직 설정과 vendor 서브도메인을 제외하는 도메인 제한은 유지한다.

복원은 소스 변경이다. 운영에 반영된 코드·환경변수·시크릿은 별도로 확인해야 한다.
배포 순서는 [ORG-CUTOVER.md](ORG-CUTOVER.md)를 따른다.
