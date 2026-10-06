# F01·F08 가입·이메일 확인·비밀번호 복구 브라우저 화면

[문서 인덱스](../README.md) · [기존 계정 서버 계약](01-account-lifecycle-design.md) · [인증 정책](01-company-access.md#사용자-위임으로-확정한-인증-기본-정책) · [직전 설정 화면](01-company-settings-browser-design.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **사용자 확정·구현·검증 완료**. 제안일·확정일·완료일: 2026-10-06. 확정 근거: 직전 응답의 “설계안 A1~A7과 파일 목록으로 확정할까요?”에 사용자가 “확정”이라고 답했다(첨부 선택 파일은 CompanySelfApprovalForm.tsx). A1~A7·파일15·검증 조건8 전체를 확정했다. 영향 ID: F01-02·F01-03·F01-06·F01-08 및 F08-09·F08-14·F08-15의 공개 계정 화면 부분. 기존 서버/DB/업무 정책은 변경하지 않았다. 첫 검증의 비통과4개로 수리를 중단한 뒤 사용자 “다음”(account-lifecycle.spec.ts 지정, 2026-10-06)으로 같은 범위의 원인 수리와 전체8조건 재검증을 재개했다. 최종8조건 모두 PASS이며 상위 전체 기능 체크는 유지한다.

## 선행 근거와 이번 범위

P-01·P-02·P-03·P-04·P-10과 확정한 구현 순서는 [계획서](../IMPLEMENTATION_PLAN.md#확정한-다음-구현-순서)의 기록을 재사용한다. 직전 설정 화면은 [8개 PASS 기록](../../.artifacts/implementation-f01-company-settings-browser/verification-results.json)을 보존한다. 이 기록은 직전 실행이며 이번 계정 화면의 테스트 실행 결과가 아니다.

다음 묶음은 **직접 가입 → 메일 확인과 최종 비밀번호 설정 → 명시적 로그인**, **복구 메일 요청 → 새 비밀번호 설정 → 재로그인**이다. 기존 서버의 공개 API 5개를 연결한다. 로그인 중 비밀번호 변경·전체 기기 로그아웃 화면, 사용 중지/재활성화·운영 SMTP·실제 전표 승인은 후속으로 유지한다. 상위 F01/F08 기능 체크는 완료로 바꾸지 않는다.

이미 확정한 이메일+비밀번호, 15~128 Unicode 코드 포인트·공백 보존, 흔한/유출 비밀번호 차단, 24시간 확인/30분 복구·일회용/재발송 무효화, 계정 존재를 드러내지 않는 202 접수, 복구 후 모든 세션 폐기, Origin 검사와 HIBP 장애 시 저장 중단을 재결정하지 않는다. 기술/정책 상세는 기존 계정 서버 계약이 기준이다.

## 제안 시점 소스 대조 — 구현 전 기록

- `server/src/auth/account-lifecycle.controller.ts:19`: 공개 register·verification request/confirm·reset request/confirm 5개. 요청은 202, 확인은 200이며 no-store다. reset 성공은 현재 쿠키를 삭제한다. 로그인 중 change는 별도 보호 API다.
- `server/src/auth/auth.schemas.ts:12`: 가입은 email/password, 요청은 email, 확인은 64자리 소문자 hex token/newPassword의 strict 입력이다. 이름·약관·회사·역할 입력 계약은 없다.
- `server/src/auth/account-lifecycle.service.ts:88`: 잠금 뒤 토큰/사용자 상태를 다시 검사하고 비밀번호·일회용 소비·남은 토큰 무효화·대상 사용자의 전체 세션 폐기·감사를 원자 저장한다. 확인 후 자동 로그인하지 않는다.
- `server/src/mail/mail.templates.ts:9`: 메일 경로는 `/verify-email#token=…`, `/reset-password#token=…`다. 원문 토큰을 GET/Referer에 넣지 않는다.
- `server/src/auth/password-policy.service.ts:10`: HIBP 범위 조회의 timeout/응답 검증과 기존 Argon2id 저장. 운영 우회 환경 변수는 없다.
- `src/pages/auth/Register.tsx:30`: 현재 폼은 preventDefault만 수행하는 템플릿이다. 이름·가짜 약관 링크를 보여주지만 가입 API를 호출하지 않는다. `src/App.tsx`에는 `/register`만 있고 확인/복구 경로는 없으며 `src/lib/api.ts`에도 공개 계정 API 연결은 없다.
- `src/lib/companyInvitationToken.ts`: Router보다 먼저 fragment를 메모리로 캡처하고 URL에서 제거하는 기존 초대 방식. 초대 구현은 그대로 두고 계정 토큰은 목적/경로별로 분리한다.

## 사용자 확정 선택값 7개

아래 A1~A7 전체를 사용자 “확정”(2026-10-06)으로 선택했다. 확정 근거와 영향 ID는 첫머리에 기록하며 완료는 실제 검증 결과로 별도 판단한다.

| ID | 항목 | 확정 선택값 | 영향·제한 |
| --- | --- | --- | --- |
| A1 | 경로·분할 범위 | 기존 `/register`를 실제 가입으로 바꾸고 공개 `/verify-email`·`/forgot-password`·`/reset-password`를 연결. 로그인 화면에 가입/확인 메일 재요청/복구 링크 | 새 보호 메뉴는 만들지 않는다. 비밀번호 변경·전체 기기 로그아웃은 다음 묶음. 현재 로그인이 있어도 메일 링크를 자동 업무 경로로 넘기지 않는다. |
| A2 | 가입·새 비밀번호 입력 | 이메일·비밀번호·확인 입력만 사용하고 ATMS 한국어 안내로 교체. 확인 필드는 서버에 보내지 않는다. 15~128 코드 포인트·두 입력 완전 일치 검사, 원문 Unicode/앞뒤 공백 보존 | 서버가 최종 차단 검사를 담당한다. 계약 없는 이름/가짜 약관 동의·소셜 로그인 요소는 제거한다. 법적 약관 작성·동의 기록은 별도 요구사항이며 이번 완료로 주장하지 않는다. |
| A3 | 명시적 실행·접수 | 가입/재발송/복구 요청은 사용자가 제출한 경우만 POST. 202는 계정 상태와 무관하게 같은 접수 안내. 가입 직후 로그인/회사/역할을 만들지 않음 | “메일을 전달했다”·“계정이 있다”라고 표시하지 않는다. 확인은 이메일 소유자가 그 화면에서 선택한 최종 비밀번호로 직접 제출하고 성공 뒤 로그인 버튼을 제공한다. 자동 로그인 없음. |
| A4 | 메일 토큰·비밀 | `/verify-email`·`/reset-password`의 정확한 `#token=64자리 hex`를 Router 생성 전 캡처·URL에서 제거하고 경로/목적별 메모리에만 유지. 비밀번호/확인값은 제출 즉시 지움 | StrictMode/초기 세션 로딩에도 한 번 열었던 토큰을 잃지 않게 한다. 토큰을 화면/Query mutation·cache/router state/storage/log/query string에 넣지 않는다. 새로고침/화면 이탈은 토큰 폐기, 메일 재진입으로 복원. 링크 열기/GET은 소비하지 않는다. |
| A5 | 성공·현재 세션 | 확인 성공은 토큰 폐기 후 현재 세션을 조회해 401일 때만 인증/조회 캐시 정리. 복구 성공은 서버 쿠키 삭제와 전체 세션 폐기에 맞춰 현재 인증/조회 캐시 정리 후 명시적 로그인 | 확인이 다른 사용자의 정상 세션을 임의로 로그아웃하지 않는다. 현재 로그인이 남으면 현재 계정 안내와 기존 명시적 로그아웃/다른 계정 로그인 경로 제공. 서버는 토큰 대상 사용자의 모든 세션을 폐기하며 다른 사용자 DB 세션은 보존한다. |
| A6 | 실패·중복·불명확 결과 | 제출 진행 중 입력/중복 제출 잠금. 400/403/429/503는 고정 안내와 새 비밀번호 재입력, 자동 POST 없음. 확인 POST의 network/예상하지 못한 5xx는 결과 미확인으로 표시하고 같은 토큰 재소비를 차단 | 503 비밀번호 검사 장애의 저장 중단은 기존 서버 회귀로 확인한다. 결과 미확인은 로그인으로 변경 여부 확인 또는 새 메일 요청을 선택하게 하고 오래된 토큰은 폐기한다. 토큰 없는 확인 화면은 재발송/복구 요청으로 안내하며 서버 오류 detail/원문 비밀을 표시하지 않는다. |
| A7 | 화면·검증 경계 | label·자동완성·status/alert·오류 요약/필드 포커스, 키보드·375/768/1440px. 전체 회귀와 전용 격리 API/DB·Mailpit로 가입/확인/복구/세션/감사 검증 | 전용 테스트 API 인스턴스의 PasswordPolicyService.fetchRange만 통제한 대역으로 교체하고 Argon2id/정책 파서/DB/SMTP는 실제 사용. 운영 우회 옵션·원본 서비스 변경 없음. 실제 HIBP 가용성·외부 운영 메일 배달 검증과 구분한다. |

## 기존 공개 API 5개와 입력·출력

| 메서드·경로 | 입력 | 정상 응답 |
| --- | --- | --- |
| POST `/api/auth/register` | `{ email, password }` | 202 `{ accepted: true }`, 가입만으로 세션/소속 생성 없음 |
| POST `/api/auth/email-verification/request` | `{ email }` | 202 `{ accepted: true }`, 계정 상태 공개 없음 |
| POST `/api/auth/email-verification/confirm` | `{ token, newPassword }` | 200 `{ success: true }`, 최종 비밀번호 설정·자동 로그인 없음 |
| POST `/api/auth/password-reset/request` | `{ email }` | 202 `{ accepted: true }`, 계정 상태 공개 없음 |
| POST `/api/auth/password-reset/confirm` | `{ token, newPassword }` | 200 `{ success: true }`, 대상 전체 세션 폐기·현재 쿠키 삭제 |

공개 POST도 서버가 Origin을 검사한다. 세션 기반 CSRF가 필요한 보호 change/logout-all API는 이 범위에 넣지 않는다. 공개 페이지의 비밀 요청은 로컬 async 핸들러로 실행하며 서버 detail을 그대로 출력하지 않는다. 기존 로그인/세션/로그아웃 연결은 재사용한다.

## 구현 파일 항목 15개

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `src/lib/api.ts` | 기존 공개 API 5개 연결·strict 본문·접수/성공 타입 |
| 수정 | `src/pages/auth/Register.tsx` | 템플릿을 실제 가입·동일 접수 안내·비밀 삭제로 교체 |
| 수정 | `src/pages/auth/Login.tsx` | 가입/확인 재발송/복구 이동과 기존 로그인 복귀 유지 |
| 수정 | `src/App.tsx` | 공개 경로 3개와 Router 전 계정 token capture 연결 |
| 생성 | `src/pages/auth/VerifyEmail.tsx` | 최종 비밀번호 설정·확인 메일 재발송·현재 세션 판별 |
| 생성 | `src/pages/auth/ForgotPassword.tsx` | 계정 상태를 노출하지 않는 복구 메일 요청 |
| 생성 | `src/pages/auth/ResetPassword.tsx` | 명시적 새 비밀번호 저장·토큰 폐기·현재 인증 정리 |
| 생성 | `src/components/auth/AccountPasswordForm.tsx` | 새 비밀번호/확인·코드 포인트/일치·즉시 삭제·접근성 공통 양식 |
| 생성 | `src/lib/accountActionToken.ts` | 계정 경로/목적별 fragment 캡처/제거·StrictMode·폐기 |
| 생성 | `tests/e2e/account-lifecycle.spec.ts` | 가입/확인/복구·세션·불명확 응답·비밀 경계·반응형 회귀 |
| 생성 | `.artifacts/implementation-f01-account-lifecycle-browser/live-account-lifecycle-check.cjs` | 전용 격리 API/DB·Mailpit·통제된 HIBP 범위 대역·실제 로그인/감사·기본 DB 전후 비교 |
| 생성 | `docs/features/01-account-lifecycle-browser-design.md` | 제안/확정·코드 흐름·검증 증거 |
| 수정 | `docs/features/01-company-access.md` | 이번 계정 화면 부분 완료와 남은 인증/업무 경계 |
| 수정 | `docs/README.md`·`docs/ROADMAP.md` | 인덱스·제안/확정/부분 완료 상태 |
| 수정 | `docs/IMPLEMENTATION_PLAN.md` | 선행 결정·이번 확정 범위·검증 후 부분 완료 근거 |

첫 구현 파일은 `src/lib/api.ts`다. 확정 뒤 IDE에서 파일을 열고 입력/출력·실패 흐름을 설명하며 목적/추가 영역 주석과 파일·줄 번호를 제공한다. 관련 파일 변경 후 테스트를 한 묶음으로 실행한다. 서버/스키마/SQL·AUTH 정책·공통 시간 설정·메일 템플릿·패키지·환경 파일·기존 초대 토큰 구현은 변경하지 않는다.

## 구현 후 검증 조건 8개

- [x] A1~A7의 실제 선택값·확정 근거/날짜/영향 ID, 파일15/API5/후속 경계를 기록한다.
- [x] 가입 strict email/password·비밀번호 확인/Unicode/공백·202 일반 안내, 가입만으로 세션/회사/소속/역할이 생기지 않는 기존 서버 회귀와 연결한다.
- [x] 확인 메일 재요청/메일 경로/명시적 최종 비밀번호 설정·자동 로그인 없음·토큰 만료/재발송 무효/목적 불일치/일회 소비를 검증한다.
- [x] 복구 요청의 계정 상태 비노출·새 비밀번호 로그인·이전 비밀번호 차단·대상 전체 기기 세션 폐기·다른 사용자 보존·현재 쿠키/인증/조회 캐시 정리를 확인한다.
- [x] StrictMode/초기 로딩·URL fragment 제거·새로고침/재진입/화면 이탈·목적별 토큰 분리, 비밀번호 제출 즉시 삭제·Query/router state/storage/log/스크린샷/증거에 비밀 없음과 GET 무소비를 검증한다.
- [x] 400/403/429/503/network·중복 잠금·자동 POST 없음·불명확 결과에서 토큰 재소비 차단, 서버 비밀번호 검사 장애 중 무저장·감사 rollback·동시 소비 회귀를 확인한다.
- [x] label/자동완성/status/alert·오류/성공 포커스와 키보드, 375/768/1440px 가로 넘침/스크린샷, 기존 로그인·초대·회사·규칙·Appearance 동작을 확인한다.
- [x] build/lint·전체 Appearance/E2E/API, 전용 격리 API/DB·Mailpit 실제 흐름/감사·기본atms 전체 테이블 전후 동일·실행 시점 readiness/최신 소스·기존 정책/상위 체크 보존을 확인한다. HIBP 실제 외부 조회/운영 SMTP와 구분한다.

위 8개는 사용자 재개 지시 뒤 전체 묶음을 다시 실행하여 모두 PASS다. 첫 실패와 재개 첫 회귀의 실행 기록은 아래에 별도 보존했다. 문서 준비 검증으로 기능 완료를 대신하지 않는다.

## 이번 재개 구현의 실행 흐름과 검증

수리 범위와 목적은 기존 A4·A5·A6를 그대로 적용하는 토큰 수명 처리다. 새 화면·서버 계약·업무 정책은 추가하지 않았다.

1. `src/lib/accountActionToken.ts:6`의 최초 capture는 정확한 경로·64자리 소문자 hex만 받아 URL fragment를 history.replaceState로 지운다. 토큰은 JS 메모리에만 있고 라우터 전달 상태·저장소·로그로 보내지 않는다.
2. `:17`의 captureNavigation은 popstate(같은 문서의 뒤로/앞으로/URL 이동)·hashchange(fragment 변경)를 받는다. `:26`에서 Router 생성 전에 등록하므로 URL을 먼저 정리한다. 같은 목적의 화면 구독이 토큰을 받으면 임시 복사본을 비운다. 다른 목적이면 새 화면의 초기화가 읽는다.
3. `:34`의 hook은 React useState로 현재 화면의 토큰을 유지하고 `:41`에서 메모리 전달을 구독한다. 다른 목적의 토큰은 받지 않는다. 화면을 떠나면 구독/임시 복사본을 지우며 새로고침에는 토큰을 복원할 저장소가 없다. StrictMode의 두 초기 렌더는 같은 최초 값을 읽는다. `:29`의 dispose는 Vite 개발 중 모듈 교체 시 이전 이벤트 리스너를 제거한다.
4. `src/pages/auth/VerifyEmail.tsx:13`과 `src/pages/auth/ResetPassword.tsx:13`은 새 토큰이 오면 이전 완료·오류 표시를 비운다. `src/components/auth/AccountPasswordForm.tsx:53`은 명시적 제출에서 코드 포인트15~128·일치를 검사하고 비밀번호 두 칸을 즉시 지운 뒤 중복 잠금과 API 호출을 실행한다. 메일 링크를 여는 동작만으로는 POST하지 않는다.
5. 확인 성공(`VerifyEmail.tsx:24`)은 토큰을 버린 뒤 현재 세션 GET을 다시 읽어 유효한 다른 계정을 유지한다. 복구 성공(`ResetPassword.tsx:20`)은 토큰과 인증/조회 캐시를 정리한다. 캐시 정리는 기존 `src/context/AuthContext.tsx:22`의 expire를 재사용한다. 불명확한 POST 결과는 같은 토큰을 다시 소비하지 않는다.

재개 첫 묶음에서는 E2E116·실제 Mailpit 가입/확인/복구/로그인·대상 세션2폐기/다른 사용자 보존·감사3·기본atms20테이블 비교가 통과했다. 기존 회사 초대 API9개만 5000ms timeout으로 실패하여8조건 중 조건8 하나가 FAIL이었다. [재개 첫 결과](../../.artifacts/implementation-f01-account-lifecycle-browser/resumed-first-results.json)·[API 로그](../../.artifacts/implementation-f01-account-lifecycle-browser/resumed-first-api.log)를 보존한다. 실행 부하 원인 가능성은 재실행 전에는 추론이며 서버/검사 제한 시간은 변경하지 않는다. 완료 게이트5에 따라 API maxWorkers1부터 실행하고 나머지 전체 검증도 다시 실행한다.

## 이번 최종 실행 증거 — 2026-10-06

[최종8조건 결과](../../.artifacts/implementation-f01-account-lifecycle-browser/verification-results.json)·[명령과 종료 코드](../../.artifacts/implementation-f01-account-lifecycle-browser/command-results.json)·[실제 흐름](../../.artifacts/implementation-f01-account-lifecycle-browser/live-evidence.json)·[직접 검토한 화면13개와 SHA-256](../../.artifacts/implementation-f01-account-lifecycle-browser/visual-review.json)을 기록했다. 재현은 API1작업자 → build/lint/Appearance → E2E → 격리 실제 흐름 → verify-completion 순서다. API는 기존5000ms를 유지하고413/413 통과했다. 부하를 낮춘 결과와 시간 초과 가능성은 일치하지만 CPU 원인을 별도로 단정하지 않는다.

| 조건 | 상태 | 최종 근거 |
| --- | --- | --- |
| 1 확정·범위 | PASS | A1~A7/파일15/API5/조건8·확정/재개 근거, 보호181파일·P/F/G139·AUTH10·직전 완료8·링크/UTF-8 보존 |
| 2 가입·입력·접수 | PASS | E2E :27/:41/:52와 실제 등록, strict 입력·Unicode/공백/일치·즉시 비밀 삭제·generic202·가입만으로 세션/회사/소속0 |
| 3 확인·메일·소비 | PASS | 실제 Mailpit 재발송/이전 토큰400·최종 비밀번호 설정·사용 토큰400·자동 로그인0, API 만료/목적/경합 회귀 |
| 4 복구·세션·로그인 | PASS | 실제 이전 비밀번호401/새 비밀번호 로그인·대상 세션2폐기·다른 사용자GET200/전체 세션행 보존·현재 HttpOnly쿠키 삭제, mock 인증 정리와 기존 expire cache clear 대조 |
| 5 토큰·비밀 경계 | PASS | 두 목적 새로고침/같은 문서/완료 후 재진입·URL 제거/이탈/StrictMode·GET무소비·storage/history/HTML/감사에 원문 비밀 없음 |
| 6 오류·중복·불명확 결과 | PASS | E2E pending/400/403/429/503/network/500·자동 재전송0/같은 토큰 차단, API 정책503/무저장/감사rollback/동시 소비 |
| 7 접근성·반응형·기존 화면 | PASS | E2E116/116(신규34/기존82)·Appearance16/16·label/포커스/키보드·375/768/1440px PNG12+실제복구 PNG1 검토 |
| 8 전체 회귀·격리·현재 상태 | PASS | build/lint exit0·API413/413(19파일)·E2E116/116·실제 감사 각1건(가입/확인/복구), 기본atms20테이블 건수/내용 해시 전후 동일·UI/API200/최신 소스 |

격리 테스트 API의 HIBP 범위 조회만 통제했고 정책 파서·Argon2id·Postgres·SMTP는 실제 실행했다. 생성한 임시 DB는 삭제한다. 기존 UiIcons의 lint 경고1·Vite 대형 chunk 경고는 있으며 오류/종료 실패는 없다. 필수 미검증 항목은 없다. **이번 범위 밖**은 로그인 중 비밀번호 변경/전체 기기 로그아웃 화면·실제 외부 HIBP 가용성·운영 SMTP 배달·실제 전표 승인·최신 Hindsight 원격 일치다. Hindsight는 기존30분 예약을 유지한다.

브라우저 검증 경로는 `http://127.0.0.1:4173/register`·`/forgot-password`이며, 로컬 Mailpit `http://127.0.0.1:8025`에서 확인/복구 링크를 연다. 202는 접수 안내이며 메일 배달 성공/계정 존재를 보증하지 않는다. 이메일 확인 후 직접 로그인하며 복구 후 모든 기기에서 다시 로그인한다.

## 이번 첫 검증 결과 — 2026-10-06

[첫 검증 결과](../../.artifacts/implementation-f01-account-lifecycle-browser/first-pass-results.json)에 명령·종료 코드·조건별 근거를 보존했다. **비통과4개이므로 AGENTS.md 작업 단위 완료 기준4에 따라 당시 수리를 중단했다.** 재개는 사용자 “다음” 근거로 같은 범위의 가장 앞선 실패 계층인 브라우저 URL 변경/토큰 수명을 수정한다. 아래 표와 설명은 수리 전 첫 실행 기록이다. [당시 E2E 로그](../../.artifacts/implementation-f01-account-lifecycle-browser/first-pass-e2e.log)·[당시 실제 흐름 로그](../../.artifacts/implementation-f01-account-lifecycle-browser/first-pass-live.log)를 보존한다.

재개 수정 파일은 accountActionToken.ts(라우터 전 popstate/hashchange 캡처·메모리 전달), VerifyEmail.tsx/ResetPassword.tsx(새 토큰 진입 때 완료/오류 상태 초기화), account-lifecycle.spec.ts(두 목적의 재진입·완료 후 새 링크 회귀)다. 기존8조건 모두 다시 실행하고 결과로 완료 여부를 판단한다. 검증용 스크립트·문서도 새 테스트 수와 결과를 반영한다. 서버·스키마·정책·패키지·환경과 이전 구현 결과는 보존한다.

`src/lib/accountActionToken.ts:5`는 모듈 최초 실행에서 fragment를 캡처하고, `:14`의 useState 초기화는 컴포넌트 최초 마운트에서만 실행한다. 확인 화면이 열린 상태에서 같은 경로에 fragment만 추가한 메일 링크로 이동하면 문서/컴포넌트가 새로 생성되지 않는다. 새 fragment를 감지하지 않아 URL에 남고 새 비밀번호 양식을 표시하지 못한다. `tests/e2e/account-lifecycle.spec.ts:93`의 새로고침 후 메일 재진입 검사와 실제 메일 검증기 `:76-77`에서 재현했다. 이 실패 이후 실제 복구·세션·감사·기본 DB 전후 비교 단계는 도달하지 못했다.

| 조건 | 상태 | 객관적 근거 |
| --- | --- | --- |
| 1 확정·범위 | PASS | verify-contract exit0, A7/파일15/API5/조건8, 보호181파일·P/F/G139·AUTH10·직전 완료8 보존 |
| 2 가입·입력·접수 | PASS | 가입/Unicode/공백/일치/즉시 삭제/strict 본문 E2E 통과, 실제 등록 후 세션·회사·소속0 확인, API413 통과 |
| 3 메일 확인·소비 | FAIL | live exit1, real UI email confirmation에서 새 비밀번호 입력 대기 TimeoutError, 최종 확인 도달 못함 |
| 4 복구·실제 세션 | UNVERIFIED | mock UI와 서버 회귀는 통과했으나 조건3 차단으로 실제 복구/쿠키/전체 세션/다른 사용자/감사 미도달 |
| 5 토큰·비밀 경계 | FAIL | E2E :93→:97 재진입 실패, open():15 URL fragment가 제거되지 않음 |
| 6 오류·중복·불명확 결과 | PASS | pending·400/403/429/503/network/500 E2E 통과, API413 내 무저장/rollback/동시 소비 회귀 통과 |
| 7 접근성·반응형·기존 화면 | PASS | 기존82 E2E·포커스/키보드 및 반응형3검사 통과, 4화면×3폭 PNG12개 직접 검토, Appearance16/16 |
| 8 전체 회귀·격리·현재 상태 | FAIL | build/lint/Appearance/API exit0, E2E exit1(112통과/1실패), live exit1, 실제 흐름/기본DB 전후 증거 불완전 |

전용 검증기는 확인 재발송과 이전 토큰400까지 진행했으며 HIBP 범위 응답만 테스트 인스턴스에서 통제했다. 실제 SMTP·정책 파서·Argon2id·새 격리 DB를 사용했다. finally에서 임시 DB를 삭제했고 Docker psql exit0 조회 결과 `atms_browser_lifecycle_%` DB는 0개다. 정상 서버와 기본 DB 설정은 변경하지 않았다. 다만 기본 DB 전체 테이블의 전후 비교 단계는 도달하지 못했으므로 보존 결과를 PASS로 주장하지 않는다. 기존 UiIcons 경고1과 Vite 대형 chunk 경고는 남아 있으며 lint 오류0·build 종료0이다.

구현한 실행 흐름은 `src/lib/api.ts:144`의 공개 API5 → `src/pages/auth/Register.tsx`/VerifyEmail/ResetPassword의 로컬 async 처리 → `src/components/auth/AccountPasswordForm.tsx:53`의 입력 검사·중복 잠금/비밀번호 즉시 삭제다. `:55`는 UTF-16 길이 대신 Unicode 코드 포인트 수를 세고 원문 공백을 유지한다. 확인 성공은 현재 세션 GET으로 다른 계정을 보존하고, 복구 성공은 AuthContext.expire로 인증/조회 캐시를 정리하는 코드와 mock 검증을 추가했다. **실제 복구 완료를 확인한 기능으로 보고하지 않는다.** 토큰 수명 처리는 위 재진입 결함이 남아 있다. 로그인 중 변경/전체 기기 로그아웃 화면·외부 HIBP 가용성·운영 SMTP·실제 전표 승인·최신 Hindsight 원격 일치는 이번 완료로 주장하지 않는다.

## 이번 제안 준비의 객관적 검증 조건 4개

아래 제안 준비 결과는 구현 전의 역사 기록이다. 당시 템플릿/경로 부재·확정 대기·새 파일 없음 판단과 현재 구현 상태를 구분한다. 준비 검증기를 구현 뒤 다시 실행해 기능 완료를 판단하지 않는다.

1. 공개 API 5개·strict 입력·접수/성공·토큰/세션 원자성·메일 경로와 현재 Register 템플릿/경로/API 부재를 소스에 대조한다.
2. 추천안7·파일 항목15·미실행 조건8·관련 문서의 로컬 링크·UTF-8을 확인한다.
3. 문서 수정 전에 기록한 코드/테스트/DB/환경/패키지·직전 설정 증거 SHA-256을 비교하고 새 구현 파일이 없는지 확인한다.
4. P/F/G 체크·AUTH10행·직전 설정 완료8개 및 기존 결과를 보존하고 인덱스/계획/로드맵/기능 문서의 제안 연결을 확인한다.

재현 명령: `node .artifacts/proposal-f01-account-lifecycle-browser/verify.cjs`. [변경 전 기준](../../.artifacts/proposal-f01-account-lifecycle-browser/baseline.json)을 보존하며 실행 결과는 검증 후 기록한다. 현재 readiness·전체 테스트 재실행은 소스 기반 제안 준비의 조건이 아니다. Hindsight 원격 최신 일치는 조회하지 않고 기존 30분 예약을 유지한다.

## 제안 준비 실행 결과 — 2026-10-06

위 명령 종료 코드 0, 준비 조건4개 모두 PASS다. [검증 결과](../../.artifacts/proposal-f01-account-lifecycle-browser/results.json)를 기록했으며 확정 대기 상태와 구현 후 조건8개는 그대로 유지한다.

| 조건 | 상태 | 실제 근거 |
| --- | --- | --- |
| 1 소스·경계 | PASS | 공개API5·strict schemas·접수/성공·토큰/세션 원자성·메일 경로·Register preventDefault와 신규 경로/API 부재 대조, 결과 check1 |
| 2 항목·링크 | PASS | 선택안7/파일15/미실행 조건8·로컬 링크/UTF-8, 결과 check2 |
| 3 코드·설정 보존 | PASS | 코드/테스트/DB/환경/패키지/직전 증거185파일 SHA-256 동일·새 구현 파일 없음, 결과 check3 |
| 4 정책·기존 완료 보존 | PASS | P/F/G139개·AUTH10행·직전 완료8개 및 PASS 결과 동일·관련 문서4개 제안 연결, 결과 check4 |

필수 준비 미검증 항목은 없다. 후속 구현 조건8개는 사용자 확정/구현 전이므로 미실행이다. 현재 서비스 readiness/전체 테스트 재실행과 최신 Hindsight 원격 일치는 이번 소스 기반 문서 준비의 검증 범위 밖이며 통과로 가정하지 않는다.
