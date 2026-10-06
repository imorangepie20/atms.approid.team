# F02·F08 거래처 첫 브라우저 화면 설계·구현 기록

[문서 인덱스](../README.md) · [거래처 요구사항](02-counterparties.md) · [완료한 서버 계약](02-counterparties-foundation-design.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **사용자 확정·화면 부분 구현·검증 완료**. 제안일・확정일: 2026-10-06. 직전의 “T1~T7·파일14개·기존API5개 연결·검증8조건으로 확정할까요?”에 사용자 “확정”(schema.prisma 지정)으로 동의했다. 아래 T1~T7 전체와14파일/5API/8조건이 실제 승인 범위다. 영향 ID: F02-01~04·06/F08-09·14·15의 거래처 화면 부분. 서버 C1~C7과 필수 P-01·02·03·04·10은 기존 확정값을 재사용하며 다시 선택하지 않는다.

## 선행 근거와 이번 작업 단위

첫 거래처 서버는 [직전 결과](../../.artifacts/implementation-f02-counterparties-foundation/results.json)의8조건PASS다. API502·Appearance16·E2E156은 그 실행의 역사 값이며 이번 새 화면의 실행 결과가 아니다. schema.prisma의 Counterparty 모델과 신규 SQL은 이미 적용됐으므로 이번 화면을 위해 추가 스키마·서버 API·권한 정책을 만들지 않는다.

계획서의 단계2 F02를 이어간다. 새 화면에서 회사별 목록·등록·상세·수정·사용 중지와 서버 검색/필터/페이지를 제공하는 범위다. 실제 전표·증빙·거래 이력 참조(F02-05), 재활성화·삭제·가져오기/내보내기·외부 사업자 확인은 후속이다. P-05 규모/성능, P-06 연동, P-07 증빙 저장은 미확정 후속 조건이며 이 기능 검증으로 대신하지 않는다. 서버와 화면의 부분 완료만 기록하고 상위 F02/F08 및 기존 P/F/G139개 체크 상태를 임의로 변경하지 않는다.

제안 준비 시점의 기존 소스 근거:

- [App.tsx](../../src/App.tsx)의 보호 레이아웃 아래에 회사 관리·규칙 현황은 있지만 거래처 경로는 없다.
- [Sidebar.tsx](../../src/components/layout/Sidebar.tsx)의 회계·세무 하위 메뉴에는 규칙 적용 현황만 있다.
- [api.ts](../../src/lib/api.ts)의 companyApi.list/select와 requestJson을 재사용한다. 회사 선택 응답의 permissions는 string[]이며 별도 권한 enum을 추정하지 않는다.
- [AuthContext.tsx](../../src/context/AuthContext.tsx)는 인증 만료 때 Query cache를 비운다. [main.tsx](../../src/main.tsx)는 조회 자동 재시도와 창 포커스 재조회를 끈다.
- [거래처 controller](../../server/src/counterparties/counterparties.controller.ts)의5경로와 [입력 스키마](../../server/src/counterparties/counterparties.schemas.ts)의 strict/Unicode/null/번호/version/query를 따른다. UI의 표시 권한은 서버 인증·회사 guard를 대체하지 않는다.

## 사용자 확정한 화면 선택값 7개

아래 T1~T7은 **사용자 확정값**이다. C1~C7의 기존 서버 정책은 유지한다. 대안은 선택값과 구분한다. 확정 근거・일자・영향 작업은 문서 상단에 기록했다.

| ID | 사용자 확정값 | 영향과 대안 |
| --- | --- | --- |
| T1 | 보호 경로 `/accounting/counterparties`, 회계·세무 → 거래처 메뉴. 회사는 사용자가 명시적으로 선택하고 회사 선택 API의 최신 역할/권한을 표시. 선택값은 이 페이지 메모리에만 유지 | 회사 목록은 기존 limit100/cursor와 더 불러오기로 전체 접근 범위를 탐색한다. 회사 변경·새로고침 때 상세/초안/등록 요청 ID를 다른 회사로 가져가지 않는다. 전역 회사 저장이나 자동 첫 회사 선택은 이 안에 없다. |
| T2 | 회사별 서버 검색(name/번호)·구분 전체/고객/공급/겸용·상태 사용중/중지/전체, 기본 사용중·페이지20. 검색 제출과 필터 변경 시 cursor/선택 상세 초기화. 서버 ID 오름차순과 cursor 이전/다음 사용 | 고객/공급 필터에는 서버 정책대로 겸용이 포함된다. 이전 cursor는 메모리 스택으로 관리. 회사/필터/cursor 전부 query key에 포함하며 이전 회사의 데이터를 새 요청 자리에서 보여주지 않는다. 임의 정렬·총 건수·현재 페이지만 검색하는 방식은 제공하지 않는다. |
| T3 | 목록에서 선택한 거래처의 상세와 등록/수정 폼을 같은 페이지에 표시. 필수 이름·구분, 선택 사업자번호·담당자·이메일·전화·주소·메모. 최신 permissions에 counterparties.write가 있을 때만 등록/수정/중지 조작 제공 | C2의 trim/코드 포인트 길이/선택 빈값null/번호10자리 정규화를 안내하고 기본 형식을 검사한다. HTML maxlength의 UTF-16 길이로 Unicode 정책을 바꾸지 않는다. 최종 유효성/권한은 서버가 판단한다. 읽기 전용 역할은 상세만 보고 중지 행은 수정/재활성화할 수 없다. 연락 정보는 URL·localStorage·로그·오류 문구에 복사하지 않는다. |
| T4 | 유효한 등록 제출 시 crypto.randomUUID()로 생성 요청 ID를 만들고 정규화 본문과 함께 메모리에 보관. 제출 중 잠금·중복 클릭 차단, 자동 재전송 없음. 응답 유실/5xx 뒤에는 고정된 같은 ID/본문을 명시적 버튼으로만 재시도 | 미확인 상태에서는 필드를 잠그고 같은 요청 재시도 또는 목록 확인 후 요청 폐기를 선택. 값 변경으로 같은 ID를 재사용하지 않는다. 성공/명시적 폐기 뒤 새 등록만 새ID. 새로고침·페이지 이탈·로그아웃 뒤에는 ID/본문을 복구하지 못하므로 목록에서 결과 확인 후 새 입력한다. 이름/번호 일치만으로 등록 성공을 추정하지 않는다. |
| T5 | 수정은 상세의 최신 version과 실제 변경 필드만 PATCH, 중지는 거래처명을 표시한 인라인 확인 뒤 version으로 POST. 성공 후 같은 회사 목록을 첫 페이지부터 갱신하고 최신 상세/상태를 표시 | 동일 값은 변경 없음으로 안내하거나 서버 no-op를 반영한다. 중지는 삭제가 아니며 ID가 남고 기본 사용중 목록에서 빠진다. 409 또는 수정/중지 응답 유실은 최신 상세를 조회하고 이전 초안을 폐기한 뒤 사용자 확인을 받아 새 입력/조작한다. 최신 값으로 자동 덮어쓰기·자동 재전송하지 않는다. |
| T6 | 로딩/빈 회사/빈 거래처/검색0건/400/401/403/404/409/429/503/연결 오류를 구분. 조회만 명시적 재시도. 401은 기존 expire로 로그인 복귀, 403은 쓰기를 중지하고 최신 회사 권한 재확인 | 권한 재확인도403이면 회사 자료와 해당 Query cache를 제거한다. 409는 번호/요청 ID/버전 등 공통 충돌을 특정 원인으로 단정하지 않는다. 늦게 온 이전 회사 응답은 폐기한다. 제출 중 회사·필터·선택 변경을 잠그고 미저장/미확인 초안의 회사 변경·취소는 인라인 확인 뒤 폐기한다. 별도 비밀번호 재확인을 추가하지 않는다. |
| T7 | 기존 HUD 토큰·Pretendard·Light/Dark/System·강조색·글자 크기 유지. 1440px 표/목록·상세, 375/768px 카드와 단일 열 폼. label·필드 오류·포커스 오류 요약·status/alert·키보드·44px 조작 영역과 스크린샷 검증 | 새 디자인 시스템/폰트/패키지를 설치하지 않는다. 실제 쓰기는 자신이 생성한 별도 임시 로컬 DB와 전용 API에서 확인하고 제거한다. 기존 기본 atms와 정상 브라우저 DB에 새 검증 거래처/계정을 넣지 않는다. 완료 뒤 기존 개발 URL에서 사용자가 화면을 확인할 수 있게 안내한다. |

## 연결할 기존 거래처 API 5개

| 메서드·경로 | 화면의 역할 |
| --- | --- |
| GET /api/companies/:companyId/counterparties | q/kind/active/limit20/cursor로 목록·필터·페이지 조회 |
| POST /api/companies/:companyId/counterparties | creationRequestId와 C2 입력 등록, counterparty/created 반환 |
| GET /api/companies/:companyId/counterparties/:counterpartyId | 최신 상세/version/active 조회 |
| PATCH /api/companies/:companyId/counterparties/:counterpartyId | version과 변경 필드만 저장 |
| POST /api/companies/:companyId/counterparties/:counterpartyId/deactivate | 인라인 확인 뒤 version으로 사용 중지 |

별도로 기존 GET /api/companies와 POST /api/companies/:companyId/select 및 인증 복원을 재사용한다. 새 서버 경로가 아니다. 모든 쓰기는 현재 인증 컨텍스트의 CSRF와 기존 HttpOnly 쿠키를 사용한다. 세션 식별자/CSRF/절대 만료는 거래처 업무로 교체하지 않는다. 서버 응답의 명시14필드만 표시하며 생성 입력 해시/요청 ID는 상세 응답에 있다고 가정하지 않는다.

## 승인 후 구현 파일 14개

다음은 **승인된 파일 목록**이다. 최초 구현 파일은 src/lib/api.ts다. 요청 파일을 IDE에서 열고, 파일별 변경 목적·입출력/실패 흐름·추가 영역을 주석과 줄 번호로 설명한다. 생성 산출물과 실행 로그/집계 JSON은 수작업 구현 파일 수에서 제외한다.

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `src/lib/api.ts` | 거래처 응답/입력/검색 타입과 기존 requestJson을 사용하는 API5함수 |
| 수정 | `src/App.tsx` | 기존 보호 레이아웃에 거래처 경로 등록 |
| 수정 | `src/components/layout/Sidebar.tsx` | 회계·세무에 거래처 메뉴 추가 |
| 생성 | `src/pages/accounting/Counterparties.tsx` | 회사 선택/권한·query key·등록 요청 식별·mutation·오류/경합 조합 |
| 생성 | `src/components/counterparties/CounterpartyList.tsx` | 표/카드·서버 검색/필터·cursor 이전/다음·명시적 상세 선택 |
| 생성 | `src/components/counterparties/CounterpartyForm.tsx` | 등록/수정 필드·기본 검증·null 정규화·오류 요약·제출 잠금 |
| 생성 | `src/components/counterparties/CounterpartyDetail.tsx` | 상세·상태/version·권한별 수정 진입·사용 중지 인라인 확인 |
| 생성 | `tests/e2e/counterparties.spec.ts` | 역할/회사·서버 검색/페이지·입력/재시도/충돌·상태·반응형/키보드 |
| 생성 | `.artifacts/implementation-f02-counterparties-browser/live-counterparty-check.cjs` | 전용 임시 DB/API의 실제 화면 쓰기/감사/세션/기존 DB 보존·캡처/정리 |
| 생성 | `docs/features/02-counterparties-browser-design.md` | 선택값·승인 근거·코드 설명·실제 검증 결과 |
| 수정 | `docs/features/02-counterparties.md` | 화면 부분의 상태와 후속 요구사항 연결 |
| 수정 | `docs/README.md` | 화면 문서 인덱스와 참조 경로 |
| 수정 | `docs/ROADMAP.md` | 확정/제안/완료 구분과 다음 단계 |
| 수정 | `docs/IMPLEMENTATION_PLAN.md` | 영향 ID의 부분 구현·검증 근거, 상위 체크 보존 |

이전 제안 준비에서는 마지막5개 문서만 작성/갱신했다. 승인된 구현의 검증 스크립트·명령 로그·증거·스크린샷은 `.artifacts/implementation-f02-counterparties-browser/`에 보관한다. 기존 시험을 실행하면서 과거 산출물 경로를 다시 쓰면 이번 산출물을 별도 저장하고 원본 완료 근거를 복원·정확 비교한다.

## 구현 후 묶어서 검증할 조건 8개 — 8PASS

- [x] 결정/계약: 실제 사용자 선택 T1~T7·확정 근거/일자/영향 ID·파일14개를 기록하고 기존 C1~C7/P/AUTH/상위 체크를 보존한다.
- [x] 회사/권한: 빈/100건 초과 회사 목록·명시적 선택·5역할과 겸임·다른 회사/늦은 응답 분리·현재 권한 회수/401을 브라우저와 실제 API로 확인한다.
- [x] 목록: 서버 검색 q·구분의BOTH 포함·사용중/중지/전체·페이지20·cursor 이전/다음·필터 변경 초기화·검색0건을 확인한다.
- [x] 등록: C2 입력/정규화/null·CSRF·UUID·이중 제출·동일/다른 입력 재시도·응답 유실 뒤 같은 본문 고정/명시적 재시도·성공 행/감사1개를 확인한다.
- [x] 수정/중지: 변경 필드/version·no-op·번호 중복/409·최신 재조회·중지 확인/취소·ID 보존/중지 행 수정 금지·미확인 결과의 자동 쓰기 없음과 감사/rollback을 확인한다.
- [x] 상태/기존 인증: 각 조회·쓰기의 로딩/빈 값/400/401/403/404/409/429/503/네트워크 오류와 오류 포커스, 조회 재시도/쓰기 잠금, 세션/CSRF/절대 만료/다른 사용자 자료 보존을 확인한다.
- [x] 화면/접근성:375/768/1440px 표/카드/폼·가로 넘침 없음·테마/강조색/글자 크기·키보드/label/필드 오류/status/alert/44px와 실제 캡처를 직접 확인한다.
- [x] 전체 회귀/실제 DB: build/lint·Appearance16·기존E2E156+신규47·API502개를 묶어서 실행. 실제 격리 DB 화면 등록/조회/수정/중지·감사/버전·기본atms public21/기존브라우저 public20 건수/내용 해시 보존·전용 DB/API 정리·정상 URL 응답을 확인한다.

서버 회귀는1작업자로 먼저 끝내고 frontend/E2E/실제 브라우저 검증을 이어 실행한다. 기존 timeout을 무작정 늘리지 않는다. 첫 검증 FAIL+UNVERIFIED가2개를 넘으면 가장 앞선 실패 계층을 보고하고 수리를 중단하며,2개 이하면 원인 수리 뒤 같은8조건 전체를 반복한다. 필수 비통과가 남으면 완료 체크하지 않는다.

## 제안 준비 검증 4개

이번 문서 작업 단위에만 적용한다. 위 구현 후8조건의 통과와 구분한다.

1. 계획의 선행 P5개와 서버8PASS, 영향 ID/후속 경계·T1~T7 추천/확정 대기 상태가5문서에 일치한다.
2. 기존 거래처 API5개와 controller/strict 입력 근거·승인받을 파일14개(수정7/생성7)·미실행8조건·새 코드 부재가 재현 가능한 수로 일치한다.
3. 준비 전166소스/SQL/시험/설정/근거 해시와 P/F/G139·AUTH10·직전17근거/첫 실패 archive를 정확 비교해 보존한다.
4. 변경5문서의 UTF-8/로컬 링크를 확인하고 현재 UI200/API ready200/거래처 미인증401을 읽기 전용으로 확인한다.

검증 명령: `node .artifacts/proposal-f02-counterparties-browser/verify.cjs`. [제안 준비 결과](../../.artifacts/proposal-f02-counterparties-browser/results.json). 미래 구현 후 검증 항목은 이번 제안에서 실행하지 않는다. 원격 Hindsight 최신 동기화도 확인하지 않았으며 기존30분 예약 규칙을 유지한다.

문서 준비4조건은 모두PASS·집계 exit0이다. 소스/근거166해시·기존 체크139/AUTH10·직전 근거17/과거 실패34파일을 보존했고5문서의UTF-8·로컬 링크355개와 현재 UI200/API200/미인증 거래처401을 확인했다. 결과 파일의 checkedAt이 실제 재검증 시각이다. 화면 구현 후8조건의 PASS는 아니다.

## 디자인 근거의 적용 범위

ui-ux-pro-max의 디자인 시스템 검색은 두 번 모두 대외 랜딩 패턴/다른 폰트를 반환해 기존 업무 화면과 맞지 않았다. 그 결과를 새 디자인 규칙으로 저장하지 않았다. 화면 외형은 [규칙 현황](../../src/pages/accounting/RuleApplications.tsx)·[기존 회사 화면](../../src/pages/companies/CompanyManagement.tsx)과 HUD/Appearance 계약을 기준으로 제안했다. 검증된 ux 검색의 Focusable Error Summary/필드별 오류 연결과 React effect 정리 권고만 적용한다. 실제 패키지는 React18이므로 React19 전용 Actions 권고는 적용하지 않는다.

사용자 구현 확정은 위 T1~T7·기존 API5개 연결·파일14개·구현 후8조건이다. 이전 제안 준비4PASS와 이번 구현 후8PASS는 별도 기록이다. 아래 최종 실행과 완료 반영 뒤 재집계로 이번 거래처 화면 부분만 완료 처리했다.

## 첫 실행과 원인 수리

2026-10-06 첫 집계는6PASS/2FAIL이다. [첫 결과와33개 원본 기록](../../.artifacts/implementation-f02-counterparties-browser/first-failed-run/.artifacts/implementation-f02-counterparties-browser/results.json), [보존 manifest](../../.artifacts/implementation-f02-counterparties-browser/first-failed-run/manifest.json)를 참조한다. 회사/권한10·목록2·등록12·수정/중지11·상태9·반응형3의 신규47개를 포함한 전체E2E203개, API502개와Appearance16개는 통과했다. 화면/접근성 조건은375px 오류 요약이 고정 헤더에 가려져FAIL, 전체 회귀/실제DB 조건은 build/lint/실DB 스크립트 종료1로FAIL이다.

앞선 원인은 기존 ES2020 설정과 맞지 않는 Array.at/String.replaceAll 사용 및 nullable 필드 대입 타입, 설치하지 않은 ESLint 규칙 억제, 검증 스크립트의 감사 필드명 오기, 오류 포커스의 기본 스크롤이다. 승인한 파일 안에서 호환되는 인덱스/정규식과 이름 필드 분기, 불필요한 억제 제거, 서버의 versionBefore/versionAfter/activeBefore/activeAfter 명칭, 오류 요약 중앙 스크롤로 수정했다. 조회 실패/로딩을 빈 목록으로 함께 표시하는 문제도 T6 상태 분리로 고치고 오류 시 빈 문구 부재·화면에 보이는 초점의 실제 좌표를 기존 시험에 추가했다. 캡처는 폰트 로딩과 스크롤 초기화를 기다린다. 서버·스키마·시간 제한·확정 정책은 바꾸지 않았다. 비통과2개이므로 완료 게이트에 따라 동일8조건 전체를 다시 실행한다.

## 두 번째 실행과 검증 순서 보완

두 번째 전체 집계는7PASS/1FAIL이다. [두 번째 결과](../../.artifacts/implementation-f02-counterparties-browser/second-failed-run/results.json)와 원문 명령/로그/캡처29개를 보존했다. 신규47개 포함E2E203·API502·Appearance16·build/lint는통과했으나실DB검증이끝나지않았다. 실제크기변경뒤반응형레이아웃이안정되기전측정한문제와,기존E2E실행중정상브라우저DB의ACCESS_DENIED감사가추가되어동시전후비교에영향을준문제를구분했다. 검증 스크립트는폰트/두프레임대기와현재실행증거의실패시기록을보완했다. 정상DB의감사행을삭제하거나덮어쓰지않았다. API1작업자→frontend/E2E묶음→E2E종료후별도실DB검증의의존순서로동일8조건전체를다시검증한다. 원인확인용격리실행은10개실DB플래그/버전4/감사3/가로폭375·768·1440·기존DB21+20전후동일/정리까지PASS였으며최종전체묶음과구분한다.

## 구현 파일과 실행 흐름

- `src/lib/api.ts:119`의 CounterpartyFields는 8개 업무 입력, View는 회사/식별자/상태/버전/시각을 합친 14개 공개 응답이다. `:307`의 API 5함수는 기존 requestJson으로 쿠키·안전한 오류 계약을 공유한다. 목록은 limit20와 서버 조건, PATCH는 version과 바뀐 필드, 중지는 version만 전송하며 쓰기에만 현재 CSRF를 보낸다. AbortSignal은 떠난 화면의 조회를 취소하는 브라우저 신호다.
- `src/App.tsx:104`는 세션 보호 레이아웃 아래 새 경로를 등록하고 `src/components/layout/Sidebar.tsx:15`는 회계·세무 메뉴에 연결한다. 기존 계정 복원·로그인·외형 설정을 그대로 사용한다.
- `src/pages/accounting/Counterparties.tsx:26`은 화면의 조합 담당이다. `:44`의 TanStack Query는 응답 저장/조회 취소를 담당하며 회사 목록에는연속페이지, `:46` 목록에는사용자·회사·검색·구분·상태·cursor, `:48` 상세에는사용자·회사·거래처ID를 키로 사용한다. 서로 다른 회사의 응답을 섞지 않고 권한이 있어야 업무 조회를 시작한다.
- 같은 파일 `:50`은 폼/UUID를 지우고, `:51`은 미저장/미확인 입력 폐기를 사용자가 확인하게 한다. `:56` 회사 선택은 세대번호로 늦은 이전 응답을 무시하고, `:65`는403 뒤 현재 회사 권한을 다시 읽는다. 권한이 회수되면 해당 회사의 Query cache와 초안을 제거하며401은 기존expire로 인증/전체조회cache를 비운다.
- 같은 파일 `:94`의 등록은 유효한 입력과UUID를 메모리에 고정하고 ref로 중복 제출을 즉시 막는다. 성공 후 상세/목록을 갱신하고4xx는고정안내,5xx/응답유실은필드를잠근동일본문수동재시도로 이어진다. `:109` 수정/중지는현재상세version만사용하고변경필드만보낸다. no-op는HTTP가없고409/통신불명확은초안폐기/최신GET으로끝나며새쓰기는사용자의새조작이필요하다.
- `src/components/counterparties/CounterpartyList.tsx:23`은 서버 필터·cursor 이동과1440표/작은화면카드를 표시한다. 받은페이지를전체목록으로취급하지않고, 조회중/실패/성공한빈자료를분리한다. `CounterpartyForm.tsx:27`은로컬입력,`:33`은trim/코드포인트길이/번호/nullable검증이다. 잘못된필드와요약을연결하고고정헤더에가려지지않게초점을옮긴다. HTML maxlength로Unicode정책을바꾸지않는다. 서버가최종유효성과권한을판정한다.
- `src/components/counterparties/CounterpartyDetail.tsx:8`은14개응답을읽어표시하고사용중행에만권한별수정/중지진입을연다. 인라인중지확인은취소시POST하지않으며중지뒤에도ID는남는다. 재활성화/물리삭제/거래이력버튼은구현하지않았다.
- `tests/e2e/counterparties.spec.ts:15`는응답을통제하되실제DOM·사용자조작·HTTP본문을검증한다. `:221`은375/768/1440px에서초점좌표/키보드/44px/가로넘침과Light/Dark/System·Indigo·large적용을확인한다. 실제서버는`live-counterparty-check.cjs`가새난수DB와전용API로연결하고응답유실/409/중지/감사/세션/읽기전용을실행한뒤자기가생성한DB만제거한다. 시험자격증명/쿠키는로그나문서에남기지않는다.

위 흐름은 이번 승인 범위의 실제 구현이다. 전표/증빙 과거 참조·외부 사업자 확인·재활성화·성능 기준과 원격 Hindsight 일치는 이번 결과에 포함되지 않는다.

## 실제 실행 검증 기록 — 2026-10-06

최종 전체 묶음은 API 502/502(21파일) → build/lint 종료0·Appearance16/16·E2E203/203(기존156+신규47) → 별도 실제 격리 DB 순서로 통과했다. [명령과 종료 코드](../../.artifacts/implementation-f02-counterparties-browser/command-results.json), [8조건 집계](../../.artifacts/implementation-f02-counterparties-browser/results.json), [실DB 증거](../../.artifacts/implementation-f02-counterparties-browser/live-evidence.json), [캡처9장 직접 검토/해시](../../.artifacts/implementation-f02-counterparties-browser/visual-review.json)를 참조한다. 문서 집계에서 첫 실패 기록 링크1개가 실제 보관 하위 경로와 다른 것을 확인해 링크만 수정하고8조건 전체를 다시 집계했다. 원본62개 실패 파일의 해시는 유지했다.

| 조건 | 결과 | 객관적 근거 |
| --- | --- | --- |
| 1 결정/계약 | PASS | T1~T7·14파일·API5, 기존P/F/G139·AUTH10 정확 비교 |
| 2 회사/권한 | PASS | 신규브라우저10개·실제API5역할/겸임/회사격리/회수 |
| 3 목록 | PASS | 신규브라우저2개·실제API 검색/구분/상태/cursor |
| 4 등록 | PASS | 신규브라우저12개·실DB응답유실/동일UUID·본문2회/행1·감사1 |
| 5 수정/중지 | PASS | 신규브라우저11개·실DBno-op/409/새명시입력/중지·같은ID/버전4 |
| 6 상태/인증 | PASS | 신규브라우저9개·세션ID/토큰해시/CSRF해시/절대만료/GET활동/다른사용자·회사보존 |
| 7 화면/접근성 | PASS | 신규브라우저3개·375/768/1440·테마/강조색/large·초점y64이상/화면내·9캡처 |
| 8 전체 회귀/실DB | PASS | 명령6개종료0·API502/Appearance16/E2E203·실DB10플래그·감사3/재인증0·DB/API정리 |

실DB 검사 구간의 기본 atms public21/기존 브라우저 public20테이블은 모두 건수/내용 해시가 전후 동일하다. 기존 E2E가 남긴 ACCESS_DENIED 감사와 새 거래처 업무 쓰기를 구분하며 정상 DB의 감사 기록을 지우지 않았다. 새 검증 계정/거래처/업무 감사는 자신이 만든 난수 DB에서만 처리하고 해당 DB와 API를 제거했다. 보호 소스163개·직전 근거17개·기존 캡처56장·첫/두 번째 실패62파일을 정확 비교했고 변경5문서의UTF-8/로컬링크와현재UI/API200을 확인했다. lint의기존UiIcons.tsx39 경고와Vite의기존chunk크기경고는실패가아니다.

사용자 확인 URL은 `http://127.0.0.1:4173/accounting/counterparties`다. 기존 계정 로그인 → 관리할 회사 명시 선택 → 새 거래처 등록 → 검색/상세 → 수정 → 사용 중지 확인 순으로 확인할 수 있다. 중지 행은 사용 상태를 전체/중지로 바꾸면 다시 조회한다. 쓰기 권한이 없는 계정은 조회만 제공한다. schema.prisma·서버/DB정책·상위F02/F08체크는 유지한다. 전표/증빙 이력, 재활성화/가져오기/외부확인·P05 성능·운영SMTP·최신 원격 Hindsight는 승인 범위 밖이므로 미검증이다.
