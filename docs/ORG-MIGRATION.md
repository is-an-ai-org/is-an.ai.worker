# org 이전 런북 (is-an-ai → is-an-ai-org)

기존 org가 flagged 되어 public에서 숨겨졌고 **사유를 확인할 수 없다.**
GitHub App **transfer도 불가능**하다. 그래서 App을 새로 만드는 경로로 간다.

## 사유를 모를 때의 전략 — 두 가설을 동시에 완화한다

| 가설 | 근거 | 완화 |
|---|---|---|
| ① 콘텐츠 신고 | Netcraft가 직접 연락해 왔다. 불법 스트리밍·우회 노드가 실재한다 | 의심 건을 한 건씩 눈으로 재검토해 **푸시 전에** 삭제 |
| ② 자동화 남용 | 커밋 대부분이 봇의 main 직접 커밋. 스팸 계정 패턴과 겉모습이 같다 | **히스토리를 안 가져간다.** 파일 현재 상태만 담은 커밋 1개로 시작 |

히스토리를 버려도 안전한 이유: Actions는 *현재 파일 상태*만 읽어 PowerDNS에 동기화하고,
워커는 새 커밋만 얹는다. 조사에 필요한 히스토리는 구 레포(private 전환 후 archive)와 D1에 남는다.
덤으로 푸시가 훨씬 빨라진다.

## 이 브랜치가 바꾼 것

`owner` 상수 1곳 + 봇 이메일 6곳을 코드에서 들어내 **wrangler vars 한 곳**으로 모았다.
기본값이 현재 운영값이라 **환경변수를 주지 않으면 동작이 이전과 완전히 동일하다** — 지금 배포해도 안전하다.

| 파일 | 변경 |
|---|---|
| `src/utils/github/github.ts` | `DEFAULT_*` + `Github.configure(env)` + `Github.identity()`. 리터럴 7곳 → 1곳 |
| `src/middlewares/init.ts` | 요청 진입 시 `Github.configure(c.env)` |
| `src/binding.d.ts` | `GITHUB_OWNER/REPO/BOT_NAME/BOT_EMAIL` (전부 optional) |
| `wrangler.jsonc` | production·development `vars`에 현재 값으로 추가 |

`env.<name>`은 top-level `vars`를 상속하지 않으므로 **두 환경 모두에** 넣었다.
빈 문자열은 무시하고 기본값을 쓴다 — 설정 실수로 `owner`가 `''`가 되면 모든 GitHub 호출이 404가 되기 때문이다.

## 이전 당일 절차

1. **새 org에 레포 생성** (이름은 그대로 `is-an.ai` 등 — 워크플로 경로에 박혀 있다)
2. **백업 3종**: 레코드 bare clone · D1 export · 서버 설정 tar. 크기가 0이 아닌 걸 확인하기 전엔 다음으로 가지 않는다
3. **삭제 목록 확정** — 의심 건을 한 건씩 눈으로. 여기 오탐이 들어가면 정상 사용자가 날아간다
4. **히스토리 없는 초기 커밋 + 푸시**
5. **GitHub App 재생성** → App ID·private key·installation ID 재발급
6. **`wrangler.jsonc`의 네 값 교체** ← 코드 수정은 없다
   ```jsonc
   "GITHUB_OWNER": "is-an-ai-org",
   "GITHUB_BOT_EMAIL": "<새 App 봇 ID>+<봇 슬러그>[bot]@users.noreply.github.com",
   ```
   새 봇 이메일은 새 org에서 App이 만든 커밋 하나의 author를 보면 확인된다.
   추측하지 말 것 — 틀리면 커밋은 되지만 author가 갈려서 나중에 추적이 안 된다.
7. **secrets 재입력** (`GITHUB_APP_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_INSTALLATION_ID`)
8. **러너 재등록** → org Settings → Actions → Runners 에 `Idle` 확인
9. **배포** → 검증 6단계: 등록 → 커밋 → D1 → Actions → PowerDNS → `dig @ns1.he.net`. 삭제 경로까지
10. **삭제 반영 확인** — 전량 동기화 후 삭제 목록 전건이 `@ns1.he.net`에서 NXDOMAIN인지.
    *파일만 지우고 확인 안 하면 그 도메인들은 계속 살아 있다.*
11. 구 레포 **private 전환 후 archive** (삭제하지 않는다 — 히스토리를 버렸으므로 원본이 유일한 감사 기록)
12. **24시간 뒤 새 org 상태 확인** ← 여기서 처음으로 어느 가설이 맞았는지 알게 된다

## 절대 하지 말 것

- **`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` 로테이트** — 전 사용자 강제 로그아웃.
  D1의 `providerId`(GitHub 숫자 ID)로 소유권이 유지되므로 OAuth App을 새로 만들어도 도메인은 그대로다.
  재로그인만 하면 된다. 반면 JWT 키를 갈면 모두가 튕긴다.
- **러너를 없애고 워커가 PowerDNS를 직접 호출** — PDNS 주소가 밖으로 나가 히든 마스터가 깨진다.
- **같은 날 PowerDNS 재시작** — 장애가 나면 org 이전 탓인지 pdns 탓인지 구분이 안 된다.
