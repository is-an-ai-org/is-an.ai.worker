# is-an.ai API 문서

## 인증

모든 API 요청은 `Authorization` 헤더에 JWT 토큰을 포함해야 합니다.
다만 user/auth/github, dev/\*\* 하위의 경로는 인증토큰을 포함할 필요가 없습니다.

```bash
Authorization: Bearer <your_jwt_token>
```

### JWKS (JSON Web Key Set)

JWT 토큰 검증에 사용되는 공개키를 조회할 수 있는 엔드포인트입니다.

```http
GET /v1/user/auth/jwks
```

응답:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "1",
      "n": "string",
      "e": "AQAB"
    }
  ]
}
```

## 개발 환경 API

### 개발자 로그인

개발 환경에서 사용할 수 있는 로그인 API입니다.

```http
POST /v1/dev/login
```

응답:

```json
{
  "user": {
    "id": "string",
    "name": "Dev User"
  },
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

## 서브도메인 API

### 서브도메인 목록 조회 (Auth 필요 없음)

등록된 모든 서브도메인을 조회합니다. GitHub에 존재하지 않는 서브도메인은 자동으로 DB에서 삭제됩니다.

```http
GET /v1/domain
```

응답:

```json
[
  {
    "subdomainId": "string",
    "subdomainName": "string",
    "description": "string",
    "record": {
      "type": "string",
      "value": "string | string[]"
    },
    "ownerId": "string",
    "createdAt": "string",
    "updatedAt": "string"
  }
]
```

### ID로 서브도메인 조회 (Auth 필요 없음)

특정 ID의 서브도메인을 조회합니다. GitHub에 존재하지 않는 서브도메인은 자동으로 DB에서 삭제되고 404 에러를 반환합니다.

```http
GET /v1/domain/id/:id
```

응답:

```json
{
  "subdomainId": "string",
  "subdomainName": "string",
  "description": "string",
  "record": {
    "type": "string",
    "value": "string | string[]"
  },
  "ownerId": "string",
  "createdAt": "string",
  "updatedAt": "string"
}
```

### 이름으로 서브도메인 조회 (Auth 필요 없음)

특정 이름의 서브도메인을 조회합니다. GitHub에 존재하지 않는 서브도메인은 자동으로 DB에서 삭제되고 404 에러를 반환합니다.

```http
GET /v1/domain/name/:subdomainName
```

응답:

```json
{
  "subdomainId": "string",
  "subdomainName": "string",
  "description": "string",
  "record": {
    "type": "string",
    "value": "string | string[]"
  },
  "ownerId": "string",
  "createdAt": "string",
  "updatedAt": "string"
}
```

### 본인 서브도메인 조회

본인이 소유한 서브 도메인 조회입니다.

```http
GET /v1/domain/my
```

응답:

```json
[
  {
    "subdomainId": "string",
    "subdomainName": "string",
    "description": "string",
    "record": {
      "type": "string",
      "value": "string | string[]"
    },
    "ownerId": "string",
    "createdAt": "string",
    "updatedAt": "string"
  }
]
```

### 서브도메인 생성

> ⚠️ **[Deprecated] 이 API는 더 이상 권장되지 않습니다. v2 엔드포인트(`/v2/domain`)를 사용하세요.**

새로운 서브도메인을 생성합니다.

```http
POST /v1/domain
```

요청 본문:

```json
{
  "subdomainName": "string",
  "description": "string",
  "record": {
    "type": "string",
    "value": "string | string[]"
  }
}
```

응답:

```json
{
  "subdomainId": "string",
  "subdomainName": "string",
  "description": "string",
  "record": {
    "type": "string",
    "value": "string | string[]"
  },
  "ownerId": "string"
}
```

### 서브도메인 수정

기존 서브도메인의 정보를 수정합니다.

```http
PUT /v1/domain/:subdomainName
```

요청 본문:

```json
{
  "description": "string",
  "record": {
    "type": "string",
    "value": "string | string[]"
  }
}
```

응답:

```json
{
  "subdomainId": "string",
  "subdomainName": "string",
  "description": "string",
  "record": {
    "type": "string",
    "value": "string | string[]"
  },
  "ownerId": "string"
}
```

### 서브도메인 삭제

서브도메인을 삭제합니다.

```http
DELETE /v1/domain/:subdomainName
```

응답:

```json
{
  "message": "Subdomain deleted successfully"
}
```

## 에러 코드

### 인증 관련 에러 (40000-40099)

| 상태 코드 | 에러 코드                   | 설명               |
| --------- | --------------------------- | ------------------ |
| 401       | UNAUTHORIZED (40001)        | 인증되지 않은 요청 |
| 401       | INVALID_CREDENTIALS (40002) | 잘못된 인증 정보   |
| 401       | TOKEN_EXPIRED (40003)       | 토큰 만료          |
| 401       | INVALID_TOKEN (40004)       | 잘못된 토큰        |
| 403       | FORBIDDEN (40005)           | 권한이 없는 요청   |

### GitHub 관련 에러 (40100-40199)

| 상태 코드 | 에러 코드                 | 설명             |
| --------- | ------------------------- | ---------------- |
| 404       | GITHUB_API_ERROR (40101)  | GitHub API 오류  |
| 401       | GITHUB_AUTH_ERROR (40102) | GitHub 인증 오류 |

### 데이터베이스 관련 에러 (40200-40299)

| 상태 코드 | 에러 코드              | 설명              |
| --------- | ---------------------- | ----------------- |
| 500       | DATABASE_ERROR (40201) | 데이터베이스 오류 |

### 유효성 검사 관련 에러 (40300-40399)

| 상태 코드 | 에러 코드                | 설명             |
| --------- | ------------------------ | ---------------- |
| 400       | VALIDATION_ERROR (40301) | 유효성 검사 오류 |
| 400       | INVALID_STATE (40302)    | 잘못된 상태      |

### 도메인 관련 에러 (40400-40499)

| 상태 코드 | 에러 코드                        | 설명                             |
| --------- | -------------------------------- | -------------------------------- |
| 400       | SUBDOMAIN_ALREADY_EXISTS (40401) | 서브도메인이 이미 존재함         |
| 404       | SUBDOMAIN_NOT_FOUND (40402)      | 서브도메인을 찾을 수 없음        |
| 400       | MAX_SUBDOMAIN_REACHED(40403)     | 서브도메인 최대 개수 (10개) 초과 |
| 400       | INVALID_SUBDOMAIN_NAME(40404)    | 예약된 서브도메인 생성 시도      |

## 레코드 타입

서브도메인의 레코드 타입은 다음과 같습니다:

### A 레코드 (IPv4)

```json
{
  "type": "A",
  "value": ["172.0.0.3", "172.0.0.4"]
}
```

### AAAA 레코드 (IPv6)

```json
{
  "type": "AAAA",
  "value": ["2001:db8::1", "2001:db8::2"]
}
```

### CNAME 레코드

```json
{
  "type": "CNAME",
  "value": "example.com"
}
```

### MX 레코드

```json
{
  "type": "MX",
  "value": [
    {
      "preference": 10,
      "exchange": "mail1.example.com"
    },
    {
      "preference": 20,
      "exchange": "mail2.example.com"
    }
  ]
}
```

### TXT 레코드

```json
{
  "type": "TXT",
  "value": ["v=spf1 include:_spf.example.com ~all", "google-site-verification=123456789"]
}
```

### 전체 예시

```

```

## v2 서브도메인 API

### 서브도메인 생성

새로운 서브도메인을 생성합니다. (v2)

- 인증 필요: `Authorization` 헤더에 JWT 토큰 필요
- 요청/응답 구조는 v1과 동일합니다.
- 단, v2에서는 더 엄격한 유효성 검사와 블랙리스트 체크가 적용됩니다.

```http
POST /v2/domain
```

요청 본문:

```json
{
  "subdomainName": "string",
  "description": "string",
  "record": [
    // v1과 동일한 레코드 구조
  ]
}
```

응답:

```json
{
  "subdomainId": "string",
  "subdomainName": "string",
  "description": "string",
  "record": [
    // v1과 동일한 레코드 구조
  ],
  "ownerId": "string"
}
```

### 서브도메인 사용 가능 여부 확인

특정 서브도메인이 사용 가능한지 확인합니다.
해당 도메인의 사용 가능 여부가 서브 도메인 생성 V2 API와 완전히 일치하므로 함께 사용해야 합니다.
https://is-an.ai 에서 Check Subdomain Availability를 확인하는데 사용합니다.

- 인증 불필요

```http
GET /v2/domain/available/:subdomainName
```

응답 예시 (사용 가능):

```json
{
  "available": true
}
```

응답 예시 (사용 불가):

```json
{
  "available": false,
  "error": "Subdomain already exists"
}
```
