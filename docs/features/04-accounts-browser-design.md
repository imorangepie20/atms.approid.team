# F04-01 계정과목 관리 화면 설계안

작성일: 2026-10-07. 상태: **계정과목 화면 부분 구현·홈서버 실제 브라우저 검증 완료 · K1~K8 PASS**.

수리 재개 근거(2026-10-07): 사용자 “수정해”(api.ts 지정). 최초 실패 기록을 보존하고 시험 설계 계층의 현재 RTL 타입·Query 캐시·HTTP 요청 계약을 대조해 수리한다. K1~K8·기존 B1~B7·홈서버 반영 승인을 유지하며 검증 통과 뒤 배포/브라우저 시험을 이어간다. api.ts에는 캐시 구분 설명을 추가하며 성공 동작을 시험의 잘못된 가정에 맞춰 바꾸지 않는다.

작업 ID: F04-01 화면 부분, F08-09·14·15 조회/입력 기반. 사용자 확정일: 2026-10-07. 확정 근거: 직전 B1~B7·구현 파일11개·홈서버 반영 범위를 제시한 응답에 사용자 “확정”(database-foundation.test.ts 지정). 아래 B1~B7의 선택값과 파일11개·완료 검증 K1~K8을 승인한 것으로 기록한다. 영향 작업은 F04-01 화면 부분과 F08-09·14·15이며 기존 P 정책과 서버 A1~A7은 유지한다.

## 수리 후 검증 및 홈서버 반영 — 2026-10-07

검증 계층 수리 후 전체 묶음을 재실행해 서버681/681(26파일)·DOM80/80(계정51+기존 증빙29)·Appearance16을 확인했다. 프런트 build/lint/시험 타입, 서버 build/시험 타입/DB 타입/schema는 모두 종료0이며 기존 UiIcons의 eslint-disable 경고1개만 남았다. 보호234파일·정책5개·P/F/G139행과 담당 문서 링크도 보존했다. [명령/종료 코드](../../.artifacts/implementation-f04-accounts-browser/commands.json)와 [현재 조건별 결과](../../.artifacts/implementation-f04-accounts-browser/results.json)를 참조한다.

홈서버 반영 범위는 승인된 계정 서버와 SQL·정적 화면이다. [적용 이력 대조](../../.artifacts/implementation-f04-accounts-browser/migration-preflight.json)의 기존11개 checksum은 로컬과 일치했고 코드 충돌은0이었다. 백업 `/mnt/external-ssd/backups/johae-server/atms/pre-accounts-20261007`에 DB 덤프·복원 목록·이전 정적 파일·서버 소스·API 이미지 ID를 보관했다(디렉터리700/덤프600). 이전 API 이미지의 `atms-api:pre-accounts-20261007` 태그를 유지했다. SQL 적용 뒤12개 checksum 일치·기존 업무 행 보존·API/app/postgres/clamav healthy·tunnel running을 확인했다. 포트/터널/비밀 설정을 수정하지 않았다. `/`·`/accounting/accounts`·`/api/health/ready`는 현재200이며 새 계정 API의 미인증 요청은401이다. [배포 근거](../../.artifacts/implementation-f04-accounts-browser/deployment-evidence.json)를 참조한다.

배포된 실제 클라이언트를 브라우저 도구로 로드하고 Fetch/XHR만 가상 API 응답으로 대체했다. 다섯 역할의 조회·관리 조작은5/5, 375/768/1440px에서 가로 넘침 없음·빈 분류/방향·오류 요약 포커스·필드 링크로 Tab 이동·44px 이상 조작 영역은3/3이다. [브라우저 근거](../../.artifacts/implementation-f04-accounts-browser/browser-evidence.json)와 [375px](../../.artifacts/implementation-f04-accounts-browser/fixture-375.png)·[768px](../../.artifacts/implementation-f04-accounts-browser/fixture-768.png)·[1440px](../../.artifacts/implementation-f04-accounts-browser/fixture-1440.png) 스크린샷은 가상 회사/자료의 화면이다. 가상 응답과 viewport 설정은 해제했고 실제 미인증 보호 경로가 로그인으로 돌아가는 것도 확인했다. Playwright spec의 CLI 실행으로 집계하지 않았다.

위 수리/배포 당시에는 실제 로그인 세션이 없어 K7을 UNVERIFIED로 남겼다. 사용자 “로그인 완료” 뒤 아래 실제 자료 시험을 실행했다. 최초 중단/수리 및 로그인 대기 기록은 당시 결과이며 현재 완료 근거와 구분한다.

## 실제 계정 브라우저 검증 완료 — 2026-10-07

사용자 “로그인 완료”(api.ts 지정) 후 기존 Chrome의 실제 HTTPS 세션으로 Approid 테스트 회사를 명시적으로 선택했다. API 응답 대체 없이 UI261007A(브라우저검증 가상 차감자산, 자산/대변)와 UI261007B(브라우저검증 가상 비용, 비용/차변)를 각각 버전1로 등록했다. 첫 계정의 이름만 “브라우저검증 가상 차감자산 수정”으로 바꾸어 버전2, 코드·이름을 표시한 인라인 확인 뒤 사용 중지하여 버전3을 확인했다. 수정 양식의 코드는 읽기 전용이고 기존 분류/방향은 비활성이다. 중지 후 수정/중지 버튼은0개이며 전표 사용 자격 없음으로 표시한다.

새로고침 후 회사를 다시 선택하고 사용 상태 전체·UI261007 검색으로 두 행을 다시 조회했다. 첫 계정은 중지/버전3, 둘째 계정은 사용중/버전1이다. [실제 최종 화면](../../.artifacts/implementation-f04-accounts-browser/live-final.png)과 [화면 상태](../../.artifacts/implementation-f04-accounts-browser/live-final.txt), [DB/감사 대조](../../.artifacts/implementation-f04-accounts-browser/live-db-evidence.json)를 참조한다. 첫 계정 ID는 495fc4be-9b80-4287-ad8c-f35960afd537, 둘째는 4e896c39-c0b7-4534-8c0d-4c043503eddc로 보존됐다. 첫 ID의 감사 버전0→1→2→3과 둘째 ID의0→1을 확인했다.

실제 시험 직전/직후23테이블을 대조해 기존 업무/참조/감사 행 손실0, 계정 추가2행과 ACCOUNT_CREATED2·ACCOUNT_UPDATED1·ACCOUNT_DEACTIVATED1의 감사 추가4행을 확인했다. 로그인 기술 테이블3개는 업무 자료 보존 비교에서 제외했다. 기존12마이그레이션 checksum은 동일하고 코드 충돌0이다. [직전 스냅샷](../../.artifacts/implementation-f04-accounts-browser/home-before-live-browser.json), [직후 스냅샷](../../.artifacts/implementation-f04-accounts-browser/home-after-browser.json), [검증 집계](../../.artifacts/implementation-f04-accounts-browser/results.json)를 참조한다. 승인한 가상 계정은 보존한다.

K1~K8 전체 묶음의 재집계 결과는8개 PASS이며 집계 명령은 종료0이다. 이번에는 실제 브라우저/DB 검증과 문서 상태·링크·소스/정책/체크 보존 검사를 실행했으며 코드 변경이 없어 앞서 통과한 서버681·DOM80·Appearance16 및10개 명령을 다시 실행하지 않았다. 가상 역할5/반응형3 근거는 이전 가상 시험으로 구분한다. 완료 범위는 승인 B1~B7의 화면 부분이며 표준 템플릿·기초 잔액·전표/원장과 F04 전체 체크는 후속이다. Hindsight 문서 반영은 기존30분 예약 실행을 유지한다.

## 선행 결정과 현재 근거

P-01·02·03·04·10은 [구현 계획서](../IMPLEMENTATION_PLAN.md#구현-착수-전-필수-게이트)의 기존 확정값을 재사용한다. 서버 A1~A7은 [계정과목 서버 설계와 검증](04-accounts-foundation-design.md#전체-재검증-완료--2026-10-06)의 사용자 확정값이며 변경하지 않는다. 이전 서버 검증 기록은 [8조건 PASS](../../.artifacts/implementation-f04-accounts/results.json)다. 이번 문서에서 서버 테스트를 새로 실행했다는 뜻은 아니다.

현재 소스에서 확인한 근거:

- [AccountsController](../../server/src/accounts/accounts.controller.ts)의 API5개와 [입력 스키마](../../server/src/accounts/accounts.schemas.ts), [역할 정책](../../server/src/auth/access-policy.ts)을 그대로 연결한다.
- [App.tsx](../../src/App.tsx)와 [Sidebar.tsx](../../src/components/layout/Sidebar.tsx)에 계정과목 경로/메뉴는 아직 없다.
- 위 경로/메뉴 부재 설명은 착수 전 근거다. 사용자 확정 뒤 두 파일에 경로/메뉴를 작성했으며 검증 완료와 구분한다.
- [거래처 화면](../../src/pages/accounting/Counterparties.tsx)의 명시적 회사 선택·회사별 query key·제출 잠금·인라인 확인 구조와 [api.ts](../../src/lib/api.ts)의 쿠키/CSRF/안전한 오류 처리를 재사용한다. 거래처 POST의 `{counterparty,created}` 응답 형식은 계정 API에 적용하지 않는다.
- [main.tsx](../../src/main.tsx)는 조회 자동 재시도·창 포커스 재조회를 끈다. [AuthContext](../../src/context/AuthContext.tsx)는 인증 만료 때 조회 캐시를 비운다.
- 현재 package.json의 React는 18.3.1 범위다. React 19 전용 Actions를 전제로 하지 않고 기존 React/TanStack Query/Testing Library를 사용한다.

## 확인할 화면 선택값 7개

아래 B1~B7은 사용자 확정값이다. 기존 서버 정책을 유지하면서 새 화면과 홈서버 반영 범위를 승인했다.

| ID | 사용자 확정 선택값 | 영향 |
| --- | --- | --- |
| B1 | 보호 경로 `/accounting/accounts`, 회계·세무 → 계정과목 메뉴. 사용자가 회사를 명시적으로 선택하고 회사 선택 응답의 역할/permissions를 표시. `accounts.read`로 조회, `accounts.manage`가 있을 때만 등록·수정·중지 제공 | 활성 소속의 다섯 역할은 조회, 회사 관리자만 관리. 첫 회사를 자동 선택하지 않고 페이지 메모리에만 선택을 유지. 회사 목록은 기존 limit100/cursor와 더 불러오기로 탐색한다. |
| B2 | 코드/이름 서버 검색·분류 전체/자산/부채/자본/수익/비용·상태 사용중/중지/전체, 기본 사용중·페이지20. UUID 오름차순과 cursor 이전/다음 사용. 검색 제출·필터 변경 때 상세와 cursor 초기화 | 사용자·회사·검색·분류·상태·cursor를 query key에 포함. 미분류는 전체 분류 조회에서 표시하며 서버에 없는 전용 필터는 추가하지 않는다. 총 건수·임의 정렬은 제공하지 않는다. |
| B3 | 목록/상세에 코드·이름·분류·정상 잔액 방향·사용 상태를 표시. 등록은 코드/이름/분류/방향 필수, 분류와 방향 모두 빈 선택값에서 시작. 수정은 이름, 또는 미분류 계정의 최초 분류/방향만 허용 | 코드 trim/ASCII 1~20자/대문자, 이름 trim/코드 포인트 1~100자 검사. 정상 잔액 방향을 분류로 자동 추정하지 않고 차감 계정도 명시 선택. 이미 분류된 계정의 분류/방향과 모든 기존 코드는 읽기 전용. 미분류/중지는 전표 사용 자격 없음으로 표시한다. `canUseInJournal`은 구조상 자격이며 전표 저장·기간·권한 검사 완료를 뜻하지 않는다고 안내한다. |
| B4 | 유효한 첫 등록 제출 때 `crypto.randomUUID()`로 요청 ID를 생성하고 정규화 본문과 함께 메모리에 고정. 즉시 중복 클릭 차단·제출 중 잠금·자동 재전송 없음. 통신 실패/5xx 뒤에는 동일 ID/본문의 명시적 재시도만 허용 | 미확인 상태는 입력을 잠그고 동일 요청 재시도 또는 목록 확인 후 인라인 폐기 선택. 값 변경에 같은 ID를 재사용하지 않는다. 서버는 현재 view만 반환하므로 생성/재요청 여부를 추정하는 문구를 쓰지 않는다. 페이지 이탈/새로고침/로그아웃 뒤에는 요청을 복구할 수 없으므로 목록을 확인한다. |
| B5 | 수정은 조회한 최신 version과 실제 변경 필드만 PATCH. 최초 분류는 category/normalBalance를 함께 전송. 중지는 계정 코드·이름을 표시한 인라인 확인 뒤 version으로 POST. 성공 후 상세 반영·목록 첫 페이지 갱신 | 409 또는 수정/중지 응답 유실은 최신 상세를 재조회하고 이전 초안을 폐기한다는 사실을 안내한 뒤 사용자가 새 입력/확인을 한다. 최신 version으로 자동 덮어쓰기·재전송하지 않는다. 중지 행은 상세만 제공하며 삭제/재활성화 버튼은 없다. |
| B6 | 로딩/회사 없음/계정 없음/검색0건/400/401/403/404/409/429/503/연결 오류를 구분. 조회는 명시적 재시도. 401은 expire, 403은 쓰기 중지·최신 회사 권한 재확인. 이전 회사 요청 취소·늦은 응답 무시 | 접근 상실 시 해당 회사 캐시/상세/초안 제거, 관리 권한 상실 시 쓰기 초안 제거. 409 원인을 버전 충돌 하나로 단정하지 않는다. 제출 중 회사·검색·필터·상세·취소 조작 잠금. 미저장/미확인 초안을 버리는 화면 내 조작은 인라인 확인. 전체 앱 이탈에는 초안 복구 기능이 없다는 안내를 표시한다. 입력/요청 ID를 URL·저장소·로그에 복사하지 않는다. |
| B7 | 기존 HUD/Pretendard/Appearance 설정을 유지. 1440px 목록·상세, 375/768px 카드/단일 열. label·필드 오류·필드로 연결되는 포커스 오류 요약·status/alert·키보드·44px 조작 영역. 구현 검증 뒤 기존 홈서버에 승인된 API/SQL과 화면을 함께 반영 | UI 패키지·포트 설정 변경 없음. 배포 전 적용 이력/자료 충돌/백업을 확인하고, 기존 테스트 회사에 구분 가능한 가상 계정2개를 생성해 이름 수정·중지를 검증한다. 검증용 계정은 보존하고 실제 전표/기초 잔액·표준 템플릿을 만들지 않는다. 실패 복구는 이전 앱/정적 파일 재적용을 우선하며 새 기록을 지우는 DB 복원을 자동 실행하지 않는다. |

## 연결할 API 5개

기본 경로 `/api/companies/:companyId/accounts`. 공개 응답8필드: `{id,code,name,category,normalBalance,active,version,canUseInJournal}`. 목록은 `{items,nextCursor}`, 생성·수정·중지는 HTTP200의 직접 view다. 모든 쓰기에 기존 쿠키·현재 CSRF를 사용한다.

| ID | 메서드·경로 | 입력/화면 역할 |
| --- | --- | --- |
| API-1 | GET 기본 경로 | q(최대100 코드 포인트), active, 선택 category, limit20, 선택 UUID cursor로 목록 조회 |
| API-2 | GET `/:accountId` | 현재 회사의 최신 상세/version 조회, 없는/다른 회사 계정은404 |
| API-3 | POST 기본 경로 | `{creationRequestId,code,name,category,normalBalance}` 등록·동일 본문 재요청 |
| API-4 | PATCH `/:accountId` | `{version,name?,category?,normalBalance?}` 중 변경 필드만; 분류/방향은 쌍으로 |
| API-5 | POST `/:accountId/deactivate` | `{version}` 사용 중지 |

회사 목록/선택·인증 복원은 기존 API를 재사용한다. 계정 생성 요청 ID/해시를 상세 응답에서 얻을 수 있다고 가정하지 않는다. 기존 계정의 코드/이름은 일괄 정규화하지 않는다. 코드 충돌은 서버의 안전한409로 안내하고 사용자 확인 없이 이전 계정 값을 고치지 않는다.

표시/전송 대응: 자산=ASSET, 부채=LIABILITY, 자본=EQUITY, 수익=REVENUE, 비용=EXPENSE, 차변=DEBIT, 대변=CREDIT. 분류/방향 null은 미분류로 표시한다.

## 승인 후 구현 파일 11개

최초 구현 파일은 `src/lib/api.ts`다. 지정한 `server/tests/database-foundation.test.ts`는 이번 화면 범위의 수정 대상이 아니며 기존 회귀 검증에 포함한다. 요청 파일을 IDE에서 열고 변경 목적·추가 영역·입출력/실패 흐름을 주석과 파일/줄 번호로 설명한다.

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `src/lib/api.ts` | 계정 응답/입력/필터 타입과 API5함수, 기존 requestJson 재사용 |
| 수정 | `src/App.tsx` | 기존 RequireSession 아래 계정과목 경로 등록 |
| 수정 | `src/components/layout/Sidebar.tsx` | 회계·세무 계정과목 메뉴 |
| 생성 | `src/pages/accounting/Accounts.tsx` | 회사·권한·조회/요청 상태·생성 재시도·충돌/캐시 조합 |
| 생성 | `src/components/accounts/AccountList.tsx` | 검색·분류/상태·cursor·표/카드·계정 선택 |
| 생성 | `src/components/accounts/AccountForm.tsx` | 등록/수정/최초 분류·정규화·필드 오류·제출 잠금 |
| 생성 | `src/components/accounts/AccountDetail.tsx` | 자격/상태·불변 값·수정 진입·인라인 중지 확인 |
| 생성 | `tests/accounts.test.tsx` | 실제 React DOM에서 권한·조회·검증·재시도·경합·초안 폐기 행동 시험 |
| 생성 | `tests/e2e/accounts.spec.ts` | 배포 주소용 역할/오류/반응형 브라우저 시나리오와 명시적 fixture |
| 생성 | `tests/e2e/accounts.deployed.config.ts` | 기존 HTTPS 주소·대상 spec 한정, webServer 없는 설정 |
| 생성 | `.artifacts/implementation-f04-accounts-browser/verify-completion.mjs` | K1~K8 실행 근거/배포 기록/자료 보존·문서 집계 |

담당 문서5개는 이 설계, [F04 담당 문서](04-journals-ledger.md), [인덱스](../README.md), [구현 계획](../IMPLEMENTATION_PLAN.md), [개발 순서](../ROADMAP.md)다. 기존 서버 설계·승인 SQL·seed·환경/터널/포트 설정은 수정하지 않는다. 빌드 파일·백업·스크린샷·실행 집계는 생성 산출물이다.

## 승인 후 실행 흐름

1. 확정값을 기록하고 파일11개를 구현한다. 현재 소속을 확인한 회사에서만 조회하고 쓰기는 관리 권한/CSRF를 확인한다. 요청 중에는 화면 조작을 잠그고 결과 확정 뒤 상태를 갱신한다.
2. 관련 DOM 시험·기존 Appearance·서버 회귀·schema/타입/build/lint를 묶어서 실행한다. 서버 DB 시험은 자신이 생성한 격리 DB만 사용한다. 기존 기본 DB를 seed/reset하지 않는다.
3. 홈서버 적용 이력과 기존 행을 조회하고 승인 SQL과 일치하는지 확인한다. 코드 정규화 충돌이나 미승인 누락 SQL이 있으면 반영 전에 원인을 보고한다. DB 덤프·이전 API 이미지·정적 파일의 백업 경로/복원 수단을 기록한다.
4. 기존 배포 절차를 이용해 승인된 계정 API와 추가 SQL, 프런트를 반영한다. 현재 터널·바인딩을 유지한다. `/health/ready`와 보호 경로/새 API를 현재 응답으로 확인한다.
5. 브라우저 도구로 기존 HTTPS 주소에서 가상 계정2개와 반응형/키보드 흐름을 확인하고 요청 전후 ID/version·스크린샷·기존 자료 비교를 기록한다. 오류/다른 역할 시험의 fixture 여부를 실제 API 시험과 구분한다. Playwright spec 작성/타입 검사만으로 브라우저 실행 PASS를 보고하지 않는다.

## 구현 완료 검증 조건 8개

| ID | 객관적 통과 조건 | 실행 근거 |
| --- | --- | --- |
| K1 | 보호 경로·명시적 회사 선택·조회5역할/관리자 관리·회사 전환 자료 분리 | 실제 DOM 행동 시험 이름/개수, 배포 URL/로그인 상태, 역할 fixture 명시 |
| K2 | 서버 검색·분류/상태·limit20·cursor 이전/다음·빈/로딩/실패 상태 | API 요청 query 비교와 DOM 목록/선택 초기화 assertions |
| K3 | ASCII/Unicode 입력 경계·명시적 분류/방향·코드/기존 분류 불변·미분류 최초 설정·중지 수정 차단 | form DOM 시험과 실제 HTTP 계약, 계정 ID/전후 값 |
| K4 | 중복 클릭1요청·미확인 등록의 같은 UUID/본문 재시도·자동 쓰기 없음 | DOM 요청 횟수/정확한 본문 비교, 기존 서버 재요청 시험 |
| K5 | version/변경 필드·중지 확인·409/응답 유실 재조회·자동 덮어쓰기 없음 | DOM PATCH/POST/GET 순서·횟수와 초안 폐기 안내, 실제 계정 version |
| K6 | 오류별 안내·401 만료·403 권한 재조회/자료 정리·취소/늦은 응답·저장소 유출 없음 | DOM 400/401/403/404/409/429/503/통신 오류와 deferred 응답 시험 |
| K7 | 홈서버 백업/승인 SQL 적용·기존 행 보존·API/화면 최신 동작·가상2계정 등록/이름 수정/중지·375/768/1440/키보드 | 백업 경로·적용 이력·기존 행 비교/허용된 감사 추가, HTTPS 현재 응답·ID/version·스크린샷 |
| K8 | 전체 회귀·schema/타입/build/lint·Appearance와 담당 문서/보호 파일/P-F-G139/정책5 검증 PASS | 명령/종료 코드·시험 이름/개수·SHA256·문서 링크와 최종 결과 JSON |

첫 검증에서 FAIL+UNVERIFIED가3개 이상이면 가장 앞선 원인 계층을 보고하고 개별 수리를 멈춘다. 2개 이하이면 근본 원인을 수정하고 K1~K8 전체 묶음을 다시 실행한다. 필수 조건이 남으면 화면/배포 작업을 완료로 표시하지 않는다. 표준 템플릿·기초 잔액·전표·원장·매핑은 후속이며 F04-01 전체 체크와 기존139개 체크 상태는 유지한다.

## 이번 설계 문서 검증

문서 수정 전 [baseline](../../.artifacts/proposal-f04-accounts-browser/baseline.json)에 보호237파일·체크139행·정책5개를 기록했다. D1=현재 서버 계약 일치, D2=기존 코드/정책/체크 보존, D3=문서5개/로컬 링크/선택7개/파일11개/완료 조건8개 일치를 검사한다. [검증 스크립트](../../.artifacts/proposal-f04-accounts-browser/verify.py)와 [결과](../../.artifacts/proposal-f04-accounts-browser/results.json)를 참조한다. 이는 문서 제안 검증이며 화면 구현·배포·새 UI 시험 완료 근거가 아니다.

## 최초 구현 검증과 중단 — 2026-10-07

화면/API 연결 파일7개·DOM 시험·배포 주소용 fixture spec/config·검증 집계기를 작성했다. 최초 DOM 묶음은 기존 증빙 시험을 포함해78 PASS/2 FAIL, 그중 새 계정 시험은49 PASS/2 FAIL이다. K2의 이전 페이지 시험은 Query 캐시를 재사용했는데 새 GET이 발생했다고 가정해 마지막 요청 cursor를 검사했다. K4의 중복 제출 시험은 기존 requestJson에 없는 fetch init.cache=`no-store`를 기대했다. 서버의 응답 Cache-Control=no-store와 fetch init.cache를 혼동한 시험 가정이다. 프런트 시험 타입 검사는 Testing Library의 ByRoleOptions에 없는 `exact` 속성으로 종료2였다. 실제 프런트 build/lint와 Appearance16, 서버 build/타입/DB 타입/schema는 종료0이다.

가장 앞선 실패 계층은 **시험 작성 시 현재 라이브러리 타입·Query 캐시/요청 함수 계약 대조**다. K2·K4·K8 세 조건 실패를 확인했으므로 [완료 게이트](../../AGENTS.md)의 “첫 검증에서 FAIL과 UNVERIFIED의 합이 2개를 넘으면 수리를 멈추고”를 적용해 개별 수리와 배포를 중단했다. 실패한 시험이나 구현 코드의 수리를 수행하지 않았다. 서버 회귀는681/681·26파일 PASS로 종료0이며 과거 시험 산출물13개는 원본 바이트로 복원했다. 보호234파일·체크139행·정책5개와 문서 링크를 보존했다. 홈서버 SQL/API/프런트 반영은 실행하지 않았다. 로그인 세션 만료도 확인했으며 브라우저 업무 시험은 미실행이다.

최초 검증의 [조건별 결과](../../.artifacts/implementation-f04-accounts-browser/first-results.json), [명령/종료 코드](../../.artifacts/implementation-f04-accounts-browser/first-commands.json), [DOM 시험](../../.artifacts/implementation-f04-accounts-browser/first-dom-tests.json), [서버 회귀](../../.artifacts/implementation-f04-accounts-browser/first-server-tests.json)를 보존했다. 집계 명령 `node .artifacts/implementation-f04-accounts-browser/verify-completion.mjs`는 필수 비통과 상태 때문에 종료1이다.

| 조건 | 최초 상태 | 실행 근거 |
| --- | --- | --- |
| K1 | PASS | 회사/역할·회사별 자료 분리 DOM10/10 |
| K2 | FAIL | 조회/페이지 DOM3/4, 캐시 재사용을 새 요청으로 가정한 cursor assertion1실패 |
| K3 | PASS | 입력·불변/최초 분류·중지 DOM15/15 |
| K4 | FAIL | 생성/재시도 DOM3/4, 기존 함수에 없는 fetch init.cache assertion1실패 |
| K5 | PASS | version·중지 확인·충돌/미확인 회복 DOM5/5 |
| K6 | PASS | 오류·권한 재확인·취소/늦은 응답 DOM13/13 |
| K7 | UNVERIFIED | 최초 로컬 필수 검증 실패로 배포/브라우저 시험 미실행; 로그인 세션도 만료 |
| K8 | FAIL | 시험 타입 종료2·DOM 종료1, 서버681/681와 기타 build/lint/타입/schema/Appearance는 종료0 |

미검증 항목: 홈서버 백업/새 SQL 적용·계정 API/화면 반영·실제 가상 계정2개·반응형/키보드 브라우저 검증. 로컬 필수 검증 실패로 배포 단계에 진입하지 않았으므로 통과로 간주하지 않는다.

## 사용자 수리 지시와 전체 재검증 — 2026-10-07

사용자 “수정해”(api.ts 지정)로 시험 설계 계층부터 수리를 재개했다. [api.ts](../../src/lib/api.ts)에 서버의 HTTP 응답 캐시와 Query의 메모리 캐시를 구분하는 설명을 추가했다. [DOM 시험](../../tests/accounts.test.tsx)은 RTL에 없는 exact 옵션을 제거하고, 이전 페이지의 실제 행/페이지/선택과 최신 캐시 재사용을 검사하며 등록의 쿠키·JSON·CSRF 계약을 확인한다. 응답 Cache-Control을 fetch init.cache와 혼동해 API 동작을 변경하지 않는다. [배포 spec](../../tests/e2e/accounts.spec.ts)의 로그인 제목도 현재 화면과 맞췄다.

첫 수리 재실행은 DOM80/80·서버681/681·모든 명령 종료0이었다. 이후 집계기의 CRLF/LF 비교 오류와 SSH 표준입력으로 전달한 셸 프로그램을 Docker가 소비하는 운영 절차 오류를 발견했다. [집계기](../../.artifacts/implementation-f04-accounts-browser/verify-completion.mjs)의 내용 비교만 줄바꿈을 정규화하고 바이트 해시는 유지했으며, 운영 셸 프로그램은 파일로 전송해 실행하도록 바꿨다. 최초 운영 시도는 DB 덤프만 생성했고 새 SQL/서비스/정적 파일 교체는 실행되지 않았음을 적용 이력11개와 기존 행 비교로 확인했다. [첫 수리 집계](../../.artifacts/implementation-f04-accounts-browser/repair-first-results.json)를 보존하고 전체 로컬 검증을 다시 실행 중이다. 완료 K1~K8과 보호234파일·정책5개·체크139행 기준을 변경하지 않는다.
