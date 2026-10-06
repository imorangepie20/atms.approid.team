# F01·F08 로그인 중 비밀번호 변경·전체 기기 로그아웃 화면

[문서 인덱스](../README.md) · [확정한 계정 서버 계약](01-account-lifecycle-design.md) · [인증 정책](01-company-access.md#사용자-위임으로-확정한-인증-기본-정책) · [직전 계정 화면](01-account-lifecycle-browser-design.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **사용자 확정·구현·검증 완료(계정 보안 화면 부분)**. 제안일·확정일·완료일: 2026-10-06. 확정 근거: 직전 응답의 “B1~B7과 파일 목록으로 확정할까요?”에 사용자가 이 설계 문서를 지정해 “확정”이라고 답했다. B1~B7·파일12·구현 후 조건8 전체를 확정했다. 영향 ID: F01-03·F01-06·F01-08 및 F08-09·F08-14·F08-15의 계정 보안 화면 부분. 서버/DB/인증 정책은 재결정하지 않는다. 재개 근거: 첫 실패 보고 뒤 사용자가 이 문서를 지정해 “다음”(2026-10-06)이라고 지시했다. 기존 범위에서 호환성·인증 상태/이탈·집계 계약을 수리하고 동일8조건 전체를 통과했다. 새 정책이나 상위 기능 전체의 완료로 확대하지 않는다.

## 선행 근거와 범위

P-01·P-02·P-03·P-04·P-10과 확정한 구현 순서의 기록은 [계획서](../IMPLEMENTATION_PLAN.md#확정한-다음-구현-순서)를 재사용한다. 직전 가입/메일 확인/복구 화면의 [8조건 PASS](../../.artifacts/implementation-f01-account-lifecycle-browser/verification-results.json)를 보존한다. 이는 직전 실행 결과이며 이번 기능 검증 결과가 아니다.

다음 묶음은 **기존 Settings → 계정 보안 → 현재 비밀번호 재확인/새 비밀번호 변경 → 명시적 재로그인**, **계정 보안 → 모든 기기 종료 확인 → 명시적 재로그인**이다. 기존 보호 POST3개를 사용한다. 기존 현재 기기 로그아웃과 세션 조회는 필요할 때 재사용한다. 계정 이메일 변경·MFA·기기별 세션 목록/개별 종료·재활성화·운영 메일 전달·실제 전표 승인은 이번 범위에 넣지 않는다. 상위 F01/F08 기능 체크를 완료로 바꾸지 않는다.

## 제안 시점 소스 대조 — 구현 전 기록

- `src/pages/Settings.tsx:156`: security 패널은 예시 Current/New/Confirm Password input과 동작 없는 Two-Factor Enable 버튼이다. `:46`의 Save Changes도 실제 계정 저장 계약이 없다. 현재 Settings 경로는 `src/App.tsx:96`의 RequireSession 아래 있으며 query section 전환을 지원한다.
- `src/pages/auth/ResetPassword.tsx:20`: 메일 복구 성공 뒤 expire와 토큰 폐기를 구현했다. 이번 로그인 중 변경에서는 메일 토큰을 사용하지 않는다. 직전 파일/토큰/공개 API를 수정할 범위가 아니다.
- `server/src/auth/account-lifecycle.controller.ts:45`: change는 보호 API이며 RequireReauthentication을 요구하고 성공200 뒤 현재 쿠키를 삭제한다. `server/src/auth/auth.schemas.ts:15`는 strict newPassword만 받으며 현재 비밀번호는 `:11`의 재확인 password 본문으로 보낸다.
- `server/src/auth/auth.controller.ts:35`·`:41`: logout-all200은 현재 쿠키를 삭제하고, reauthenticate200은 기존 세션을 확인한다. logout-all에는 비밀번호 재확인 decorator가 없다. Origin/세션/CSRF는 `server/src/auth/auth.guard.ts:32`·`:47`의 공통 보호를 받는다.
- `server/src/auth/account-lifecycle.service.ts:109`: 새 비밀번호 정책 검사 후 사용자 잠금과 현재 세션/계정/최근5분 재확인을 다시 검사한다. 비밀번호·남은 action token 무효화·대상 사용자의 모든 세션 폐기·PASSWORD_CHANGED 감사가 같은 transaction이며 다른 사용자는 대상이 아니다. commit 뒤 변경 알림 메일을 보낸다. 메일은 변경 완료의 배달 보증이 아니다.
- `server/src/auth/auth.service.ts:47`: logout(all=true)은 대상 사용자 세션을 폐기하고 LOGOUT_ALL 감사를 원자 저장한다. 비밀번호/회사 소속/역할을 변경하지 않는다. `:55` 재확인은 계정 추측 한도와 현재 세션 유효성을 다시 검사한다.
- `src/context/AuthContext.tsx:22`: expire는 현재 session/status와 Query cache를 정리한다. `src/pages/auth/Login.tsx:10`은 기존 from 경로를 복원한다. 이번 성공/결과 미확인 안내는 원문 비밀이 없는 고정 키만 전달하는 추가 설계다.

## 사용자 확정 선택값 7개

아래 B1~B7 전체를 사용자 “확정”(2026-10-06)으로 선택했다. 선택값·확정 근거·확정일·영향 ID는 첫머리에 기록했다. 기존 AUTH 정책과 비밀번호/세션 시간은 그대로 유지한다.

| ID | 항목 | 확정 선택값 | 영향·제한 |
| --- | --- | --- | --- |
| B1 | 위치·범위 | 기존 `/settings?section=security`를 계정 보안 패널로 교체하고 Security 항목을 “계정 보안”으로 표시. 이 패널의 예시 Save Changes·2FA Enable 요소 제거 | 새 경로/헤더/사이드바/Profile 변경 없음. Appearance와 다른 Settings 섹션은 유지한다. 로그인한 모든 사용자가 회사 소속/역할과 무관하게 자기 계정에 적용한다. |
| B2 | 입력·비밀 | 현재 비밀번호·새 비밀번호·새 비밀번호 확인 3칸. 현재1~128/새15~128 Unicode 코드 포인트·공백 보존·새 값 완전 일치. 현재 current-password, 새 값 new-password 자동완성. 최종 제출 즉시 3칸 삭제 | 현재 값은 reauthenticate에만, 새 값은 change에만 보내고 확인 값은 전송하지 않는다. 로컬 async handler에서만 사용하며 Query mutation/cache·storage·router state·URL·로그에 비밀을 저장하지 않는다. 취소/패널 이탈/사용자 identity 변경은 입력과 확인 상태를 폐기한다. |
| B3 | 비밀번호 변경 실행 | “비밀번호 변경”을 명시적으로 제출하면 현재 CSRF로 재확인 POST → 성공200일 때만 change POST. 매 제출마다 현재 비밀번호를 다시 확인하며 진행 중 두 동작/입력/중복 제출 잠금 | 서버의 최근5분 보호를 유지하고 브라우저가 시간/재확인 완료를 추측해 우회하지 않는다. 재확인 실패 뒤 change를 보내지 않는다. 새 정책 검사 실패503은 기존 서버의 무저장 계약을 따르고 다음 직접 제출은 3칸 재입력부터 시작한다. |
| B4 | 모든 기기 종료 확인 | 별도 카드에서 “모든 기기 로그아웃” → 같은 패널의 확인/취소 → 최종 버튼에서 logout-all POST. 현재 계정과 현재 기기도 포함됨을 표시하고 회사 소속/권한/비밀번호는 유지됨을 설명 | 서버에 없는 새 비밀번호 재확인 요구를 추가하지 않는다. 확인 화면 열기/GET/취소만으로 POST하지 않는다. 확인 대상 user.id가 바뀌면 폐기하고 최종 호출은 현재 세션의 CSRF를 사용한다. 기기 개수/목록을 API 근거 없이 표시하지 않는다. |
| B5 | 성공·재로그인 안내 | change/logout-all200 후 기존 expire로 인증·Query cache를 비우고 `/login` replace 이동. Login에서 password-changed/all-signed-out 고정 안내를 표시. 자동 로그인 없음 | 안내는 allowlist의 고정 키만 router state에 넣고 이메일/비밀번호/토큰/서버 detail은 넣지 않는다. 로그인 성공은 기존 from 복귀를 유지하며 새 비밀번호 변경과 전체 종료 결과를 구분한다. |
| B6 | 실패·불명확 결과 | 재확인401은 현재 비밀번호 실패와 세션 만료를 구분하기 위해 GET session:200이면 기존 사용자 유지/재입력,401이면 expire/고정 만료 안내. change/logout-all401도 만료 처리. 400/403/429는 고정 오류·비밀 삭제·새 명시적 입력, 자동 재전송 없음 | change/logout-all의 network/예상 밖5xx는 저장/종료 결과 미확인으로 표시하고 두 작업을 잠근다. change의 정책503 무저장와 logout-all의5xx 미확인을 구분한다. GET session401은 인증만 정리하며 작업 성공을 단정하지 않는다. GET200이면 정상 현재 세션을 임의로 폐기하지 않고, GET 실패면 미확인 상태 유지. GET 재확인과 기존 현재 기기 logout 후 로그인은 사용자의 별도 명시적 선택으로 제공하고 동일 변경/전체 종료를 자동 재실행하지 않는다. |
| B7 | 화면·검증 경계 | 한국어 카드·현재 계정 안내·label/fieldset/status/alert·오류 요약/포커스·키보드·44px·375/768/1440px. 전체 회귀와 전용 임시 API/DB·Mailpit로 비밀번호/세션/감사/알림 검증 | 테스트 API 인스턴스의 PasswordPolicyService.fetchRange만 통제한 대역을 사용하고 실제 정책 파서·Argon2id·DB·SMTP 실행. 외부 HIBP 가용성/운영 배달 검증과 구분. API1작업자부터 시작해 공유 자원 부하를 낮추며5000ms/서버 설정을 변경하지 않는다. 기존 공개 계정/회사/초대/규칙/Appearance 회귀도 보존한다. |

## 기존 보호 API 3개와 계약

| 메서드·경로 | 입력·보호 | 정상 응답 |
| --- | --- | --- |
| POST `/api/auth/reauthenticate` | strict `{ password }`, 현재 세션·Origin·CSRF·기존 로그인 추측 한도 | 200 `{ success: true }`, 현재 세션 재확인 시각 갱신 |
| POST `/api/auth/password/change` | strict `{ newPassword }`, 현재 세션·Origin·CSRF·최근5분 재확인 | 200 `{ success: true }`, 새 비밀번호·남은 action token 무효·대상 전체 세션 폐기·현재 쿠키 삭제·PASSWORD_CHANGED 감사·변경 알림 |
| POST `/api/auth/logout-all` | 빈 본문 `{}`, 현재 세션·Origin·CSRF | 200 `{ success: true }`, 대상 전체 세션 폐기·현재 쿠키 삭제·LOGOUT_ALL 감사 |

logout-all의 빈 본문은 이번 클라이언트가 전송할 값이며 서버가 별도 strict body schema를 선언했다고 주장하지 않는다. 재확인과 변경은 두 요청이며 하나의 사용자 명시적 제출에 연결한다. 재확인 성공만으로 비밀번호 변경이 완료된 것은 아니다. 확인 없이 결과를 재소비하거나 성공을 추정하지 않는다.

## 구현 파일 항목 12개

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `src/lib/api.ts` | 기존 changePassword/logoutAll 보호 호출2·CSRF와 strict 구성 본문, reauthenticate/session/logout 재사용 |
| 수정 | `src/pages/Settings.tsx` | 기존 security 패널 연결·계정 보안 이름·이 패널 예시 Save Changes/2FA 제거 |
| 수정 | `src/pages/auth/Login.tsx` | 성공/만료/미확인 고정 notice allowlist와 기존 복귀 유지 |
| 생성 | `src/components/settings/AccountSecuritySettings.tsx` | 자기 계정 안내·재확인→변경·전체 종료 확인·현재 세션/오류/미확인/캐시/이동 처리 |
| 생성 | `src/components/auth/PasswordChangeForm.tsx` | 현재/새/확인 3입력·Unicode/일치·즉시 삭제·입력/중복 잠금·접근성 |
| 생성 | `tests/e2e/account-security.spec.ts` | 보호 경로·strict/CSRF·두 요청 순서·실패/미확인·종료 확인·비밀·포커스·반응형 회귀 |
| 생성 | `.artifacts/implementation-f01-account-security-browser/live-account-security-check.cjs` | 전용 API/임시DB/실제 로그인·변경·종료·알림·감사·기본DB 전후 비교 |
| 생성 | `.artifacts/implementation-f01-account-security-browser/verify-completion.cjs` | 전체 검증 증거·보존·실행 시점 현재 상태를8조건으로 집계 |
| 생성 | `docs/features/01-account-security-browser-design.md` | 이번 제안/확정·코드 흐름·실행 증거 |
| 수정 | `docs/features/01-company-access.md` | 이번 자기 계정 보안 부분 완료와 후속 경계 |
| 수정 | `docs/README.md`·`docs/ROADMAP.md` | 인덱스·추천/확정/부분 완료 상태 |
| 수정 | `docs/IMPLEMENTATION_PLAN.md` | 영향 ID·확정 근거·검증 후 부분 완료 |

첫 구현 파일은 `src/lib/api.ts`다. 확정 뒤 IDE에서 대상 파일을 열고 변경 범위·입출력·실패 흐름을 설명하며 목적 주석과 줄 번호를 제공한다. 관련 코드 변경 후 전체 검증을 묶어서 실행한다. ResetPassword.tsx·공개 토큰/helper·기존 AuthContext·서버·schema/SQL·AUTH 정책·패키지·환경·메일 템플릿과 이전 실행 결과는 수정하지 않는다.

## 구현 후 검증 조건 8개

- [x] B1~B7 실제 선택값·확정 근거/날짜/영향 ID, 파일12/API3/후속 경계와 기존 경로를 기록한다.
- [x] 보호 Settings 진입/복귀·현재 계정 identity·회사/역할 독립, Security 예시 버튼 교체·Appearance와 기존 화면 보존을 확인한다.
- [x] 현재/새/확인·코드 포인트/공백/일치·strict 본문·CSRF·명시적 재확인→변경 순서와 실패 시 변경 미호출, 비밀 즉시 삭제/중복 잠금/이탈 폐기를 검증한다.
- [x] 실제 새 비밀번호 로그인/이전 값401·남은 토큰 무효화·대상 전체 세션 폐기/다른 사용자·현재 쿠키/인증/Query 정리·PASSWORD_CHANGED 감사/알림 Mailpit을 확인한다.
- [x] 모든 기기 종료 확인/취소/identity·CSRF·명시적 POST·현재/다른 기기401·다른 사용자200·비밀번호/소속/역할 유지·LOGOUT_ALL 감사와 고정 성공 안내를 확인한다.
- [x] 400/401/403/429/503/network/예상 밖5xx·stage별 세션 재조회·자동 재전송 없음·미확인 작업 잠금/성공 미단정, 정책 장애 무저장/재확인 만료/세션 폐기 경합/감사 rollback 회귀를 검증한다.
- [x] label/자동완성/status/alert·오류/확인/취소/로그인 안내 포커스·키보드·375/768/1440px/스크린샷·비밀 없음과 고정 notice allowlist를 확인한다.
- [x] build/lint·전체Appearance/E2E/API·전용API/격리DB/실제SMTP·기본atms 전체 테이블 전후 건수/해시 동일·실행 시점 readiness/최신 소스·P/F/G/AUTH/직전8PASS 보존을 확인한다.

위8개는 아래 재개 후 최종 결과와 대조하여 완료했다. 준비 검증4개로 기능 완료를 대신하지 않았다. 첫 미통과7개로 중단했던 기록을 보존했고 사용자 재개 지시 뒤 같은8조건 전체를 통과했다. 상위 P/F/G 기능 체크는 변경하지 않았다.

## 제안 준비의 객관적 검증 조건 4개

아래는 구현 전 준비의 역사 기록이다. 당시 template/호출 부재·확정 대기·새 구현 파일 없음 판단과 현재 상태를 구분하며 준비 검증기를 구현 뒤 다시 실행해 기능 완료를 판단하지 않는다.

1. 보호 POST3·strict 입력·Origin/CSRF/5분·원자 변경/세션/쿠키/감사/알림과 현재 Settings template/브라우저 호출 부재를 소스에 대조한다.
2. 선택안7·파일12·구현 후 미실행8·확정 대기·관련 문서 로컬 링크·UTF-8을 확인한다.
3. 변경 전 [기준](../../.artifacts/proposal-f01-account-security-browser/baseline.json)의 코드/서버/schema/환경/패키지/직전 증거225파일 SHA-256을 비교하고 새 구현 파일이 없는지 확인한다.
4. P/F/G139개·AUTH10행·직전 계정 완료8개와 PASS 결과를 보존하고 인덱스/계획/로드맵/기능 문서의 제안 연결을 확인한다.

재현 명령: `node .artifacts/proposal-f01-account-security-browser/verify.cjs`. 현재 서비스/테스트를 이전 기록 그대로 성공으로 가정하지 않는다. 이번 준비는 소스·문서 대조이며 최신 readiness·전체 회귀·외부 HIBP/운영 SMTP·Hindsight 원격 최신 일치를 확인하는 작업이 아니다. Hindsight는 기존30분 예약을 유지한다. 실행 결과는 실제 검증 후 기록한다.

## 제안 준비 실행 결과 — 2026-10-06

위 명령 종료 코드0이며 당시 준비4조건 모두 PASS였다. [준비 검증 결과](../../.artifacts/proposal-f01-account-security-browser/results.json)에 실제 대조와 개수를 기록했다. 당시 B1~B7은 확정 대기이고 구현 후8조건은 미실행이었다. 이후 사용자 확정과 아래 실패 결과를 이 역사 기록으로 대체하지 않는다.

| 조건 | 상태 | 실제 근거 |
| --- | --- | --- |
| 1 계약·현재 소스 | PASS | 보호 POST3·strict 입력·Origin/CSRF/5분·비밀번호/세션/쿠키/감사/알림, Settings template/호출 부재 대조; results check1 |
| 2 항목·문서 | PASS | 추천7/파일12/미실행8·확정 대기·로컬 링크/UTF-8; results check2 |
| 3 구현·증거 보존 | PASS | 코드/서버/schema/환경/패키지/직전 증거225파일 SHA-256 동일·새 구현 파일 없음; results check3 |
| 4 정책·완료 보존 | PASS | P/F/G139·AUTH10·직전 완료8/PASS8 유지·관련4문서 제안 연결; results check4 |

당시 필수 준비 미검증 항목은 없었다. 당시 구현 후 조건8개는 사용자 확정/구현 전이므로 미실행이었다. 최신 서비스 readiness·전체 테스트 재실행·외부 HIBP/운영 SMTP·최신 Hindsight 원격 일치는 소스 기반 준비 범위 밖이었다. 현재 구현 상태는 다음 결과를 따른다.

## 첫 구현 검증 결과 — 2026-10-06

[명령·종료 코드](../../.artifacts/implementation-f01-account-security-browser/first-failed-run/command-results.json), [첫 집계](../../.artifacts/implementation-f01-account-security-browser/first-failed-run/verification-results.json), [실패 분석](../../.artifacts/implementation-f01-account-security-browser/first-failed-run/failure-analysis.json)을 보존한다. API1작업자부터 실행했고 API413/19파일·lint0오류·Appearance16은 통과했다. build는 TS2550으로 종료1, E2E는156개 중141통과/15실패(기존116/116 통과, 새40개 중25통과/15실패)로 종료1, 격리 실행은 비밀번호 변경 후 로그인 안내 대기 TimeoutError로 종료1이다.

집계 명령 `node .artifacts/implementation-f01-account-security-browser/verify-completion.cjs` 종료1. 첫 결과는 **PASS1/FAIL6/UNVERIFIED1, 미통과7개로 수리 중단·미완료**다. [AGENTS.md](../../AGENTS.md)의 “첫 검증에서 FAIL과 UNVERIFIED의 합이 2개를 넘으면 수리를 멈추고” 규칙을 적용했다. 최초 결과를 덮어쓰거나 개별 증상을 고치고 재실행하지 않았다.

| 조건 | 첫 상태 | 구체적 근거·해석 |
| --- | --- | --- |
| 1 확정·범위·문서 | PASS | B1~B7/파일12/조건8/근거·날짜·영향 ID/로컬 링크382/UTF-8; first check1 |
| 2 보호 경로·현재 계정·Settings | FAIL | 집계기의 suite.suites 오류. 원본 E2E 보호 진입은 통과, 이탈 테스트 :70은 change POST 기대0/실제1; first check2 |
| 3 입력·순서·비밀 | FAIL | 집계 오류로 조건 판정 실패. 개별 Unicode 경계/즉시 삭제/중복/CSRF는 통과했지만 E2E :39의 변경 후 고정 안내가 없음; first check3 |
| 4 실제 변경·세션·토큰·감사·알림 | UNVERIFIED | live.log의 real UI password change 안내 대기 TimeoutError, 최종 live-evidence.json 없음; 뒤의 대조를 통과로 추정하지 않음 |
| 5 전체 종료·다른 계정·역할 | FAIL | 집계 오류와 E2E :102의 종료 후 안내 실패. 실제 격리 전체 종료 단계에 미도달; first check5 |
| 6 오류·불명확 결과 | FAIL | 집계 오류와 만료/현재 기기 종료 후 안내 실패. 기존 서버413 통과로 UI 조건 완료를 대신하지 않음; first check6 |
| 7 접근성·반응형·고정 안내 | FAIL | 집계 오류와 안내/포커스 실패. 기본/확인6장 검토, 안내3장/실제2장 없음; first check7/visual-review.json |
| 8 전체 회귀·격리·보존 | FAIL | build1/E2E1/live1로 전체 명령 조건 실패. 부분 통과/보존은 아래 별도 기록; first check8 |

### 실패를 일으킨 앞선 계층

프런트 구현의 호환성·인증 상태 전환과 검증 집계 계약을 먼저 해결해야 한다. 현재 코드 수리는 중단했다.

1. **빌드 호환성:** ES2020 라이브러리인 `tsconfig.json:5`에서 `src/pages/auth/Login.tsx:19`의 ES2022 Object.hasOwn을 지원하지 않는다. build.log TS2550이 직접 근거이며 설정은 변경하지 않았다.
2. **인증 정리·경로 전환:** `AccountSecuritySettings.tsx:35`의 expire와 `:37`의 안내 포함 이동 사이에 `App.tsx:76` 보호 경로 이동이 경쟁할 수 있다는 소스 기반 추론이다. [현재4173 재현](../../.artifacts/implementation-f01-account-security-browser/first-failed-run/navigation-diagnostic.json)에서 합성 API로 명시적 change POST1 후 `/login`의 router state에 from만 남고 accountNotice는 없으며 status요소0개임을 확인했다. [안내 없는 화면](../../.artifacts/implementation-f01-account-security-browser/first-failed-run/security-failure-login.png)을 기록했다. 정상 서버/DB에 쓰지 않은 진단이다.
3. **이탈 타이밍:** `AccountSecuritySettings.tsx:26`은 passive effect cleanup으로 active를 끈다. E2E :70에서 Appearance 클릭 직후 재확인 응답을 풀면 change POST1이 관측됐다. 라우터 전환 완료/cleanup 시점의 경합 가능성은 추론이며 테스트 타이밍과 실제 이탈 계약을 함께 조사해야 한다.
4. **집계 계약:** `verify-completion.cjs:11`은 모든 suite에 suites 배열이 있다고 가정하지만 Playwright JSON 말단은 이를 생략한다. 2/3/5/6/7의 flatMap 오류를 각각의 기능 실패로 해석하면 안 된다. 원본을 읽기 전용 대조한 실제 테스트 개수는 failure-analysis.json에 별도 기록했다. 기준223개에 승인 대상 Settings.tsx가 Windows 구분자 키로 남은 기준 작성 오류도 발견했다. 집계기/기준을 사후 수리하지 않았다.

### 보존 확인과 미검증 범위

기준223개 중 승인된 Settings.tsx1개를 제외한 **222개 SHA-256은 동일**, 승인 범위 밖 불일치0개다. 이전 위치의 재실행 산출물7개는 current-regression-output에 보관했고 이전 증거37개 원본은 백업과 정확히 일치하도록 보존했다. P/F/G139·AUTH10·직전 완료8개는 동일하다. UI4173/API4300 readiness200, 이번 security 임시 DB 잔여0개를 확인했다. 부분 확인이 조건8 전체 PASS를 뜻하지 않는다.

필수 미검증은 실제 변경의 전체 세션/토큰/쿠키/다른 사용자/감사/알림 대조, 실제 전체 종료의 비밀번호·회사 소속·역할 보존, 안내3장/실제 결과2장과 기본 atms20테이블의 이번 격리 실행 후 전체 비교다. 안내 대기에서 실행이 중단되어 최종 근거를 만들지 못했다. 외부 HIBP·운영 SMTP·MFA/재활성화/기기 목록/실제 전표 승인·최신 Hindsight 원격 일치는 승인 범위 밖이며 기존30분 예약은 변경하지 않았다.

### 첫 수리 전 코드 설명 — 역사 기록

- `src/lib/api.ts:143`의 changePassword는 새 값만 `{ newPassword }`로 POST, `:146`의 logoutAll은 `{}`와 현재 CSRF를 보낸다. 기존 requestJson이 쿠키/JSON/오류 처리를 맡는다.
- `src/components/auth/PasswordChangeForm.tsx:14`의 세 값은 화면 state다. `:22`에서 Unicode 코드 포인트 수와 일치를 검사하고 `:26`에서 제출 직후 세 state를 비운 뒤 부모 async handler에 현재/새 값만 넘긴다. 확인 값은 API에 전달하지 않는다. label/fieldset/자동완성/alert/오류 포커스를 제공한다.
- `src/components/settings/AccountSecuritySettings.tsx:13`은 React key를 user.id로 지정해 계정 교체 시 패널을 새로 만든다. `:39`의 GET probe는200이면 세션 채택/401이면 로그인 이동, `:50`의 failed는 재확인401과 변경·종료401, 정책503과 불명확5xx를 구분하도록 작성했다. 결과 안내 이동에는 위 실패가 남아 있다.
- 같은 파일 `:77`의 change는 재확인200 다음 최신 CSRF로 변경을 호출한다. `:88`의 endAll은 확인한 user.id를 검사하고 최종 버튼에서만 전체 종료를 호출한다. uncertain/probeFailed는 쓰기를 막고 수동 GET/현재 기기 종료를 별도로 제공한다. 이탈 검사와 안내 전환의 검증은 실패했다.
- `src/pages/Settings.tsx:22`·`:48`·`:158`은 계정 보안 이름/임시 Save Changes 숨김/패널 연결이다. Appearance와 다른 섹션은 유지했다. `src/pages/auth/Login.tsx:12`·`:36`의 고정 안내 allowlist/출력은 작성했으나 호환성 오류와 상태 소실로 기능 완료가 아니다.
- `tests/e2e/account-security.spec.ts:6`에 합성 자격 증명만 쓰는 행동40개를 추가했다. 격리 실행은 자신의 PasswordPolicyService.fetchRange만 통제하고 실제 정책 파서/Argon2id/DB/SMTP를 쓰도록 작성했다. 서버·schema·SQL·AUTH 정책·패키지·환경과 직전 공개 계정 파일은 변경하지 않았다.

## 사용자 지시에 따른 수리 재개 — 2026-10-06

사용자가 첫 실패 보고 뒤 이 문서를 지정해 “다음”이라고 지시했다. 기존 B1~B7·파일12·검증8과 F01/F08 영향 ID를 그대로 적용한다. 새로운 정책/기능 범위를 추가하지 않는다. 첫 실패의 로그·보고서·화면·진단·수리 전 소스는 first-failed-run과 SHA-256 manifest로 보존한다. 이 절의 재개 기록은 위 역사적 중단 결과와 구분한다.

수리 대상은 `Login.tsx`의 ES2020 자체 속성 검사, `AccountSecuritySettings.tsx`의 인증 해제/경로 이동을 같은 React transition에 묶는 처리와 URL/commit 이탈 검사, 기존 logout API/401 계약을 같은 안내 처리에 연결하는 부분, `verify-completion.cjs`의 말단 suite/승인 파일 구분자 처리다. App/AuthContext·서버·DB·정책·기존40개 브라우저 행동 조건은 변경하지 않는다. IDE에서 대상 파일을 열고 범위를 설명한 뒤 수정했다.

동일한8조건을 다시 검증한다. API1작업자부터 실행한 뒤 build/lint/Appearance를 묶고 E2E156개·격리 API/임시DB/Mailpit·11화면/375·768·1440px·기본atms20테이블 전후 비교·현재UI/API·222파일/P-F-G139/AUTH10/직전PASS8/첫 실패 archive를 확인한다. 실제 결과가 나오기 전에는 완료 체크를 바꾸지 않는다.

## 재개 후 실제 실행 결과 — 2026-10-06

수리 후 전체 검증 묶음은 모두 통과했다. [최종8조건](../../.artifacts/implementation-f01-account-security-browser/verification-results.json), [명령·종료 코드](../../.artifacts/implementation-f01-account-security-browser/command-results.json), [실제 DB·메일 결과](../../.artifacts/implementation-f01-account-security-browser/live-evidence.json), [직접 검토한11화면과 해시](../../.artifacts/implementation-f01-account-security-browser/visual-review.json)를 참조한다. build/lint exit0·Appearance16/16·E2E156/156(기존116+새40)·API413/413(19파일)이며 테스트 조건·시간 제한·서버 설정을 바꾸지 않았다.

| 조건 | 최종 상태 | 구체적 근거 |
| --- | --- | --- |
| 1 확정·범위·문서 | PASS | 사용자 확정/재개 근거·B1~B7·파일12·API3·기존 경로/후속 경계·UTF-8/로컬 링크; final check1 |
| 2 보호 경로·현재 계정·Settings | PASS | 관련 E2E3: 회사/역할 없이 보호 진입/복귀·identity 폐기·이탈 후 change0; Appearance/기존116도 통과 |
| 3 입력·순서·비밀 | PASS | 관련 E2E11: Unicode15/128/129·공백/일치·재확인→변경·strict 본문/최신CSRF·제출 직후3칸 삭제·중복/이탈 방지 |
| 4 실제 변경·세션·토큰·감사·알림 | PASS | 명시적 재확인1/change1·이전 비밀번호401/새 값 로그인·남은 복구 토큰400·대상2세션 폐기/현재 쿠키 삭제·PASSWORD_CHANGED1/REAUTH_SUCCEEDED1·Mailpit 변경 알림 |
| 5 전체 종료·다른 계정·역할 | PASS | 확인/취소/identity/중복·strict 구성 본문{}/CSRF·명시적logout-all1·대상2세션 폐기·다른 사용자200/사용자·세션 전체 행 동일·비밀번호 해시/회사/소속/READ_ONLY 역할 동일·LOGOUT_ALL1 |
| 6 오류·불명확 결과 | PASS | 관련 E2E29와 서버413: 400/401/403/429/503/network/5xx·세션200/401/조회 실패·불명확 쓰기 잠금/수동 조회/현재 기기 종료·자동 재시도 없음·5분/동시 폐기/정책 장애 무저장/감사 rollback |
| 7 접근성·반응형·고정 안내 | PASS | 관련 E2E6: label/자동완성/alert/status/오류·확인·취소·로그인 포커스/키보드/44px/no overflow·고정키 allowlist. 375/768/1440px9장+실제 변경/종료2장 직접 검토/정확한 SHA-256 |
| 8 전체 회귀·격리·현재 상태·보존 | PASS | 모든 명령 exit0·격리API/임시DB/실제Argon2id·DB·SMTP·기본atms20테이블 전후 건수/행 해시 동일·현재UI4173/API4300 readiness200/최신 소스·보호222/P-F-G139/AUTH10/직전PASS8/첫 실패64파일 해시 동일 |

필수 미검증 항목은 없다. 임시 API/검증 DB는 실행 후 종료·제거한다. 기존 정상 UI/API 서비스와 기본 DB는 유지했다. 전용 API 인스턴스의 PasswordPolicyService.fetchRange만 통제했고 실제 정책 파서/Argon2id/DB/SMTP를 실행했다. **실제 외부 HIBP 가용성, 운영 SMTP의 수신자 배달, 최신 Hindsight 원격 일치는 이번 범위 밖**이다. MFA·재활성화·기기 목록과 실제 전표 승인도 후속이다. 기존30분 동기화 예약을 변경하거나 즉시 동기화하지 않았다.

### 수리 후 코드 설명

`src/pages/auth/Login.tsx:20`은 ES2020의 `Object.prototype.hasOwnProperty.call`로 고정 안내의 자체 키만 선택한다. constructor/__proto__/임의 문자열은 출력되지 않으며 계정 입력이나 서버 detail을 화면 상태로 전달하지 않는다. `:37`의 기존 AccountNotice가 로그인 안내와 포커스를 맡는다.

`src/components/settings/AccountSecuritySettings.tsx:35`의 leave는 이 화면에서 후속 처리를 먼저 막은 뒤 `:40`의 **React startTransition** 안에서 기존 expire와 안내 포함 navigate를 함께 실행한다. transition은 UI 갱신의 우선순위를 묶는 React 기능이며, 현재 BrowserRouter도 같은 방식으로 경로를 갱신한다. 인증을 먼저 즉시 해제했을 때 기존 RequireSession이 안내 없는 이동을 실행하던 경합을 막는다. expire는 AuthContext의 세션/Query cache를 지우고, navigate는 로그인 경로·고정 안내 키·복귀 경로만 남긴다. 비밀번호 변경/전체 종료는200에만 성공 안내를, 조회401이나 불명확 결과는 별도 고정 안내를 사용한다.

같은 파일 `:27`의 useLayoutEffect는 DOM commit 때 active를 정리한다. `:83`의 change는 재확인 후 `:91`에서 현재 사용자·실제 pathname/section을 다시 검사한다. 주소는 클릭 즉시 바뀌고 Router 화면은 뒤늦게 바뀔 수 있으므로 cleanup 전 이탈도 잡는다. 확인을 마친 뒤에만 최신 CSRF로 새 값의 변경 POST를 보낸다. 기존 실패했던 :70 브라우저 테스트를 그대로 실행해 후속 change0을 확인했다.

같은 파일 `:107`의 endCurrent는 기존 authApi.logout/현재CSRF/401 계약을 재사용한다. 성공 또는 이미 만료된401이면 위 leave에서 인증과 안내 이동을 함께 처리한다. Context.logout의 즉시 expire를 호출해 다시 같은 경합을 만들지 않는다. 다른 실패는 세션 조회 실패/고정 오류 상태로 남기며 전체 종료나 비밀번호 변경을 재전송하지 않는다. `:97`의 전체 종료와 `:56`의 stage별 오류 구분은 원래 승인한 계약을 유지한다.

`verify-completion.cjs:12`는 JSON의 말단 suite에 하위 배열이 없을 수 있음을 처리한다. 승인된 기존 파일은 경로 구분자를 정규화해 보호 비교에서 제외하며 원본 baseline은 바꾸지 않는다. 첫 실패64개 산출물의 SHA-256과 보호222개를 함께 검증한다. `--complete` 마지막 실행은 기능8조건뿐 아니라 문서의8개 완료 표시도 검사한다. 이는 실패를 숨기는 예외가 아니라 승인 범위/실제 보고서 구조의 잘못된 가정을 고친 것이다.

브라우저 확인 경로: `http://127.0.0.1:4173/settings?section=security`. 미로그인 시 로그인 후 같은 패널로 복귀한다. 비밀번호 변경은3칸 입력 후 제출하고, 전체 종료는 별도 확인/취소 후 최종 확정한다. 두 동작의200 후 고정 안내에서 명시적으로 다시 로그인하며 같은 패널로 돌아온다.
