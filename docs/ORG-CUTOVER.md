# AWS API의 GitHub 조직 전환

API Gateway의 연결 대상은 AWS Lambda다. Cloudflare Worker를 배포하는 절차는 사용하지 않는다.

1. 기존 Terraform state, DynamoDB 데이터, Git 레코드, PowerDNS 존의 백업을 확인한다.
2. 새 레코드 레포의 데이터가 완전한지 확인한다. 전체 DNS 동기화의 대량 삭제 가드를 유지한다.
3. GitHub App과 Actions runner가 새 조직을 사용할 수 있는지 확인한다.
4. DNS 전체 동기화를 `dry_run=true`로 실행해 삭제 예정 레코드를 검토한다.
5. Lambda 환경변수와 Secrets Manager의 GitHub App 설정을 확인한다.
   설정 목록은 [ORG-MIGRATION.md](ORG-MIGRATION.md)에 있다.
6. API 코드를 빌드하고 로컬 테스트를 실행한다. 기존 AWS 계정과 리소스를 대상으로 배포한다.
   `npm run deploy`는 코드만 갱신하므로 환경변수·시크릿 변경은 별도로 적용해야 한다.
7. 테스트 도메인을 등록하고 GitHub → Actions → PowerDNS → 권한 DNS 응답을 확인한다.
   Lambda의 DynamoDB 레코드와 삭제 경로도 확인한다.
8. 호스팅은 `/prepare` → S3 업로드 → `/confirm` 순서와 CloudFront 서빙을 확인한다.

JWT 키, 도메인 소유권, 기존 DNS 존은 조직 이전 때문에 교체하지 않는다.
전체 동기화에서 예상 밖의 대량 삭제가 나오면 적용하지 않는다.

롤백에는 이전 Lambda 코드, 환경변수, Secrets Manager 버전을 사용한다.
Cloudflare 코드는 Lambda의 롤백 대상이 아니다.
