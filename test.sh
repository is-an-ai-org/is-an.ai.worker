#!/bin/bash

# API 서버 URL
API_URL="http://localhost:8787"

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

error() {
    echo -e "${RED}✗ $1${NC}"
}

# HTTP 상태 코드와 응답 본문을 모두 가져오는 함수
make_request() {
    local response
    response=$(curl -s -w "\n%{http_code}" "$@")
    local status_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    echo "$status_code"
    echo "$body"
}

# 1. 개발자 로그인
log "1. 개발자 로그인 시도..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/v1/dev/login")
TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    error "로그인 실패"
    exit 1
fi
success "로그인 성공: $TOKEN"

# 2. 서브도메인 생성
log "2. 서브도메인 생성 시도..."
CREATE_RESPONSE=$(make_request -X POST "$API_URL/v1/domain" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "subdomainName": "test-subdomain.test",
        "description": "Test subdomain for API testing",
        "record": [
            {
                "type": "A",
                "value": ["172.0.0.3", "172.0.0.4"]
            },
            {
                "type": "AAAA",
                "value": ["2001:db8::1"]
            },
            {
                "type": "CNAME",
                "value": "example.com"
            },
            {
                "type": "MX",
                "value": [
                    {
                        "preference": 10,
                        "exchange": "mail1.example.com"
                    }
                ]
            },
            {
                "type": "TXT",
                "value": ["v=spf1 include:_spf.example.com ~all"]
            }
        ]
    }')

STATUS_CODE=$(echo "$CREATE_RESPONSE" | head -n1)
BODY=$(echo "$CREATE_RESPONSE" | tail -n+2)

if [ "$STATUS_CODE" -ne 200 ]; then
    error "서브도메인 생성 실패 (상태 코드: $STATUS_CODE)"
    echo "$BODY"
    exit 1
fi
success "서브도메인 생성 성공"
echo "$BODY" | jq '.'

# 3. 서브도메인 목록 조회
log "3. 서브도메인 목록 조회 시도..."
LIST_RESPONSE=$(make_request -X GET "$API_URL/v1/domain" \
    -H "Authorization: Bearer $TOKEN")

STATUS_CODE=$(echo "$LIST_RESPONSE" | head -n1)
BODY=$(echo "$LIST_RESPONSE" | tail -n+2)

if [ "$STATUS_CODE" -ne 200 ]; then
    error "서브도메인 목록 조회 실패 (상태 코드: $STATUS_CODE)"
    echo "$BODY"
    exit 1
fi
success "서브도메인 목록 조회 성공"
echo "$BODY" | jq '.'

# 4. 내 서브도메인 목록 조회
log "4. 내 서브도메인 목록 조회 시도..."
MY_LIST_RESPONSE=$(make_request -X GET "$API_URL/v1/domain/my" \
    -H "Authorization: Bearer $TOKEN")

STATUS_CODE=$(echo "$MY_LIST_RESPONSE" | head -n1)
BODY=$(echo "$MY_LIST_RESPONSE" | tail -n+2)

if [ "$STATUS_CODE" -ne 200 ]; then
    error "내 서브도메인 목록 조회 실패 (상태 코드: $STATUS_CODE)"
    echo "$BODY"
    exit 1
fi
success "내 서브도메인 목록 조회 성공"
echo "$BODY" | jq '.'

# 5. ID로 서브도메인 조회
SUBDOMAIN_ID=$(echo "$BODY" | jq -r '.[0].subdomainId')
log "5. ID로 서브도메인 조회 시도 (ID: $SUBDOMAIN_ID)..."
GET_BY_ID_RESPONSE=$(make_request -X GET "$API_URL/v1/domain/id/$SUBDOMAIN_ID" \
    -H "Authorization: Bearer $TOKEN")

STATUS_CODE=$(echo "$GET_BY_ID_RESPONSE" | head -n1)
BODY=$(echo "$GET_BY_ID_RESPONSE" | tail -n+2)

if [ "$STATUS_CODE" -ne 200 ]; then
    error "ID로 서브도메인 조회 실패 (상태 코드: $STATUS_CODE)"
    echo "$BODY"
    exit 1
fi
success "ID로 서브도메인 조회 성공"
echo "$BODY" | jq '.'

# 6. 이름으로 서브도메인 조회
log "6. 이름으로 서브도메인 조회 시도..."
GET_BY_NAME_RESPONSE=$(make_request -X GET "$API_URL/v1/domain/name/test-subdomain.test" \
    -H "Authorization: Bearer $TOKEN")

STATUS_CODE=$(echo "$GET_BY_NAME_RESPONSE" | head -n1)
BODY=$(echo "$GET_BY_NAME_RESPONSE" | tail -n+2)

if [ "$STATUS_CODE" -ne 200 ]; then
    error "이름으로 서브도메인 조회 실패 (상태 코드: $STATUS_CODE)"
    echo "$BODY"
    exit 1
fi
success "이름으로 서브도메인 조회 성공"
echo "$BODY" | jq '.'

# 7. 서브도메인 수정
log "7. 서브도메인 수정 시도..."
UPDATE_RESPONSE=$(make_request -X PUT "$API_URL/v1/domain/test-subdomain.test" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "description": "Updated test subdomain description",
        "record": [
            {
                "type": "A",
                "value": ["172.0.0.5"]
            },
            {
                "type": "TXT",
                "value": ["updated-txt-record"]
            }
        ]
    }')

STATUS_CODE=$(echo "$UPDATE_RESPONSE" | head -n1)
BODY=$(echo "$UPDATE_RESPONSE" | tail -n+2)

if [ "$STATUS_CODE" -ne 200 ]; then
    error "서브도메인 수정 실패 (상태 코드: $STATUS_CODE)"
    echo "$BODY"
    exit 1
fi
success "서브도메인 수정 성공"
echo "$BODY" | jq '.'

# 8. 에러 케이스 테스트
log "8. 에러 케이스 테스트 시작..."

# 8.1 인증 없이 요청
log "8.1 인증 없이 요청 시도..."
NO_AUTH_RESPONSE=$(make_request -X GET "$API_URL/v1/domain")
STATUS_CODE=$(echo "$NO_AUTH_RESPONSE" | head -n1)
BODY=$(echo "$NO_AUTH_RESPONSE" | tail -n+2)

if [ "$STATUS_CODE" -eq 401 ]; then
    success "인증 없이 요청 실패 (예상된 결과)"
    echo "$BODY"
else
    error "인증 없이 요청이 예상과 다른 결과를 반환함 (상태 코드: $STATUS_CODE)"
    echo "$BODY"
fi

# 8.3 존재하지 않는 서브도메인 조회
log "8.3 존재하지 않는 서브도메인 조회 시도..."
NOT_FOUND_RESPONSE=$(make_request -X GET "$API_URL/v1/domain/name/non-existent.test" \
    -H "Authorization: Bearer $TOKEN")
STATUS_CODE=$(echo "$NOT_FOUND_RESPONSE" | head -n1)
BODY=$(echo "$NOT_FOUND_RESPONSE" | tail -n+2)

if [ "$STATUS_CODE" -eq 404 ]; then
    success "존재하지 않는 서브도메인 조회 실패 (예상된 결과)"
    echo "$BODY"
else
    error "존재하지 않는 서브도메인 조회가 예상과 다른 결과를 반환함 (상태 코드: $STATUS_CODE)"
    echo "$BODY"
fi

# 9. 서브도메인 삭제
log "9. 서브도메인 삭제 시도..."
DELETE_RESPONSE=$(make_request -X DELETE "$API_URL/v1/domain/test-subdomain.test" \
    -H "Authorization: Bearer $TOKEN")

STATUS_CODE=$(echo "$DELETE_RESPONSE" | head -n1)
BODY=$(echo "$DELETE_RESPONSE" | tail -n+2)

if [ "$STATUS_CODE" -ne 200 ]; then
    error "서브도메인 삭제 실패 (상태 코드: $STATUS_CODE)"
    echo "$BODY"
    exit 1
fi
success "서브도메인 삭제 성공"
echo "$BODY" | jq '.'

log "모든 테스트 완료!" 