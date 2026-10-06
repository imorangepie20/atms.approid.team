# F01·F08 초대 수락·본인 회사 접근 요청 브라우저 화면

[문서 인덱스](../README.md) · [직전 관리자 화면](01-company-access-browser-design.md) · [초대·요청 서버 계약](01-company-invitations-design.md) · [회사와 사용자 권한](01-company-access.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **사용자 확정·본인 접근 화면 묶음 구현 및 검증 완료**. 제안일·확정일·검증일: 2026-10-06. 확정 근거: 이 문서의 8개 선택안·15개 파일 항목·8개 검증 조건을 제시한 뒤 사용자가 구현 계획서에 “OK”로 동의했다. 아래 표의 8개 추천값 전체를 선택값으로 확정했다. 영향 ID: F01-02·F01-05·F01-08 및 F08-09·F08-14·F08-15의 본인 회사 접근 화면 부분. DB·서버 정책 변경은 포함하지 않는다.

## 선행 근거와 이번 범위

필수 정책 P-01·P-02·P-03·P-04·P-10은 [계획서의 사전 결정](../IMPLEMENTATION_PLAN.md#사전-결정-체크리스트)을 재사용한다. 직전 관리자 화면은 7개 API·8개 조건을 완료했고 초대 수락・본인 요청 API를 후속으로 명시했다. 이번에는 그 4개 API를 연결해 **확인된 기존 계정의 회사 소속 진입**을 구현한다.

기존 확정사항은 다시 선택하지 않는다. 초대·요청 7일 만료, 초대 수락 시 지정 이메일·발행자 권한 검사와 현재 세션 교체/다른 기기 폐기, 관리자 승인 시 요청자의 기존 세션 폐기, 요청 역할 EXTERNAL_TAX 고정, 관리자 전달 companyId 사용, 서비스 전체 회사 검색 제외는 서버 확정 계약이다. 수락만 현재 비밀번호 재확인이 필요하며 본인 요청 생성·취소에는 유효 로그인·Origin/CSRF를 적용한다.

## 사용자 확정 선택값 8개

아래 값 전체는 사용자 “OK”(2026-10-06)로 확정되었다. 해당 근거와 영향 ID는 문서 첫머리에 기록한다. 구현 완료 여부는 아래 검증 결과와 별도로 판단한다.

| 항목 | 확정 선택값 | 영향·제한 |
| --- | --- | --- |
| 초대 진입 | 메일에 이미 사용 중인 `/accept-company-invitation#token=...` 전용 화면 | 일반 로그인 redirect에서 fragment가 유실되는 문제를 피하고 기존 메일 서식/서버를 보존한다. 링크 열기나 로그인만으로 수락하지 않는다. |
| 토큰·로그인 | 토큰 형식을 확인한 뒤 fragment를 주소에서 제거하고 메모리에만 유지. 비로그인 상태는 같은 화면의 로그인 양식으로 인증 | router state·쿼리 캐시·localStorage·sessionStorage·로그에 토큰을 넣지 않는다. 새로고침/화면 이탈 후에는 메일 링크를 다시 열어야 한다. StrictMode 재마운트도 처리하도록 캡처를 멱등적으로 구현·검증한다. |
| 수락 확인 | 현재 로그인 이메일·회사 소속 및 역할 부여/다른 기기 로그아웃 영향을 안내하고 현재 비밀번호 입력 후 직접 수락 | 기존 API에는 수락 전 회사명·역할 preview가 없다. 이름·역할을 추측하지 않으며 실제 회사 식별번호·부여 역할은 수락 성공 후 응답으로 표시한다. 잘못된 계정은 로그아웃 후 같은 화면에서 재로그인할 수 있다. |
| 본인 요청 화면 | 보호 경로 `/company-access`와 탐색 메뉴 `회사 접근 요청`; 관리자가 전달한 회사 식별번호(UUID)를 입력하거나 `?companyId=` 링크로 채움 | 회사 소속이 없어도 로그인 계정은 화면에 진입한다. 회사 검색/공개 상세 조회 없이 입력 확인 후 신청한다. UUID를 사람이 외우게 하지 않도록 전달 링크도 제공한다. |
| 관리자 전달 | 기존 `/companies` 선택 회사 관리자 영역에 `접근 요청 링크 복사`와 복사 불가 시 선택 가능한 링크 표시 | `company.members.manage` 권한일 때만 표시한다. 링크에는 회사 ID만 포함하며 초대 토큰·역할·이메일은 넣지 않는다. 자동 이메일/메신저 전송은 하지 않는다. |
| 본인 목록 | 본인의 요청만 25개 cursor로 표시하고 회사 식별번호·상태·만료 시각·version 및 대기 건 취소 제공 | 본인 GET 응답에는 회사명·다른 요청자 정보가 없다. 관리자용 requester 타입과 구분하며 임의 회사 상세 API를 호출하지 않는다. 반려·취소·만료 후 새 신청은 서버의 기존 정책을 따른다. |
| 처리·실패 | 취소는 대상 회사 식별번호 확인 후 version을 제출하고, 404/409면 확인 상태를 닫고 본인 목록을 갱신. 수락 성공은 교체 세션 반영 후 결과 유지 | 자동 재전송/자동 수락을 하지 않는다. 잘못된 비밀번호 401은 유효 세션을 유지하고 진짜 세션 만료는 재로그인을 안내한다. 수락 결과에서 `회사 관리로 이동`을 누르면 최신 목록을 조회한다. |
| 계정 범위 | 이메일 확인을 완료한 기존 계정을 대상으로 로그인·수락·신청 연결 | 신규 가입·이메일 확인·복구 웹 화면은 별도 묶음이다. 현재 `/register` 템플릿을 실제 가입 기능으로 안내하지 않는다. 계정 준비가 안 된 사용자는 먼저 가입·확인이 필요함을 안내한다. |

## 기존 서버 API 4개와 입력·출력

| 메서드·경로 | 브라우저 입력 | 출력·후속 처리 |
| --- | --- | --- |
| POST `/api/company-invitations/accept` | 재인증 후 `{ token }`, 현재 CSRF | invitation/member/session. 교체 세션을 adoptSession에 반영하고 캐시의 이전 권한 자료를 비운다. 원문 토큰은 성공 또는 무효 토큰 오류 후 폐기한다. |
| POST `/api/companies/:companyId/access-requests` | UUID 경로와 strict 빈 본문 `{}` | accessRequest. 신규 또는 동일 대기 건 반환 후 본인 목록 갱신. 역할 입력 없음. |
| GET `/api/me/company-access-requests` | limit=25, 본인 cursor | 본인 items/nextCursor. requester 상세·회사명 없음. |
| POST `/api/me/company-access-requests/:accessRequestId/cancel` | `{ version }`, 현재 CSRF | accessRequest. 대기 건 취소 후 본인 목록 갱신. |

서버 근거: `server/src/companies/company-access-flows.controller.ts`, `company-access-flows.schemas.ts`, `company-access-flows.service.ts` 및 `server/src/mail/mail.templates.ts`. UUID/token/version 검증은 기존 서버 계약을 유지한다. 400·401·403·404·409·429·503은 고정 화면 문구로 안내하고 응답 원문·토큰·비밀번호를 오류에 복사하지 않는다. 초대의 무효/소비/만료/이메일 불일치는 같은 400 안내로 처리한다. 409는 발행자 권한 변경·기존 소속·대기 요청 충돌 등을 구체적으로 추측하지 않고 관리자 확인을 안내한다.

수락 전에는 서버의 회사 소속 권한이 없으므로 회사 상세·초대 관리자 목록을 미리 호출하지 않는다. 수락 후 결과에 있는 ID·역할만 표시한다. 요청 승인으로 현재 세션이 폐기된 경우 다음 보호 요청의 401에서 인증·캐시를 정리하고 재로그인하게 한다. GET은 활동 연장이나 신청·수락을 실행하지 않는다.

## 수정·생성할 구현 파일 항목 15개

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `src/lib/api.ts` | requester 없는 본인 요청 view와 API 4개·초대 수락 교체 세션 타입 |
| 수정 | `src/App.tsx` | 공개 초대 진입 화면과 보호된 본인 요청 화면 라우트 |
| 수정 | `src/components/layout/Sidebar.tsx` | 회사 소속 없는 로그인 사용자도 본인 요청 화면에 접근하는 메뉴 |
| 수정 | `src/pages/auth/Login.tsx` | 기존 로그인 양식 공유; 원래 로그인/복귀 동작 보존 |
| 생성 | `src/components/auth/AccountLoginForm.tsx` | 로그인 입력·제출·비밀번호 삭제·고정 오류를 일반/초대 화면에서 재사용 |
| 생성 | `src/lib/companyInvitationToken.ts` | 초대 fragment 형식·멱등 캡처·주소 제거·메모리 보관/폐기; 영속 저장 없음 |
| 생성 | `src/pages/companies/AcceptCompanyInvitation.tsx` | 세션 상태별 로그인·명시적 재인증/수락·교체 세션·결과/실패 화면 |
| 생성 | `src/pages/companies/CompanyAccessRequests.tsx` | 회사 ID 입력/링크 채움·본인 cursor 목록·취소 확인·상태/재시도 |
| 수정 | `src/components/companies/CompanyWorkspace.tsx` | 관리자 전달용 회사 접근 요청 링크와 복사 fallback |
| 생성 | `tests/e2e/company-self-access.spec.ts` | fragment/로그인/수락·세션·본인 요청·cursor/취소/충돌·정보 경계·반응형 행동 검증 |
| 생성 | `.artifacts/implementation-f01-company-self-access-browser/live-company-self-access-check.cjs` | 격리 DB·Mailpit 신규 초대 실제 수락 및 신청→관리자 승인/반려→본인 조회·감사 검증 |
| 생성 | `docs/features/01-company-self-access-browser-design.md` | 결정·파일·구현 흐름·실행 증거 |
| 수정 | `docs/features/01-company-access.md` | 본인 회사 접근 화면 부분과 남은 계정/설정 화면 경계 |
| 수정 | `docs/README.md`·`docs/ROADMAP.md` | 문서 인덱스와 제안/확정/부분 완료 상태 |
| 수정 | `docs/IMPLEMENTATION_PLAN.md` | 다음 범위 및 검증 뒤 부분 완료 근거 |

첫 구현 파일은 `src/lib/api.ts`이다. 파일별 변경 목적과 입출력·실패 흐름을 설명하며 진행한다. 서버/스키마/마이그레이션·메일 서식·환경·패키지는 변경하지 않는다. 기존 테스트의 공통 mock 보완이 필요한 경우 범위와 이유를 먼저 설명한다.

## 구현 후 묶어서 검증할 조건 8개

- [x] 확정한 8개 값·사용자 근거·확정일·영향 ID, 15개 파일 항목·기존 API 4개 및 후속 경계를 기록한다.
- [x] Mailpit의 fragment 링크가 로그인/세션 로딩/StrictMode를 거쳐 유지되고 주소·router state·쿼리 캐시·영속 저장·로그·오류에 토큰을 남기지 않는다. 링크만 열거나 로그인할 때 수락 POST를 실행하지 않는다. 새로고침/잘못된 토큰/메일 재진입을 검증한다.
- [x] 지정 이메일 로그인·현재 비밀번호 재인증·명시적 수락·부여 역할·교체 CSRF/세션·초기 절대 만료 보존·다른 기기 세션 폐기·감사를 실제 격리 DB에서 검증한다. 잘못된 계정/소비/만료/취소/재발송 토큰 및 기존 소속/발행자 권한 경계는 서버 회귀와 결합한다.
- [x] 회사 ID 입력/전달 링크/복사 fallback·빈 strict 본문 신청과 EXTERNAL_TAX 고정, 동일 대기 반환·기존 소속/반대 대기·없는 회사/429 처리를 검증하고 회사 검색/공개 상세 요청이 없음을 확인한다.
- [x] 본인 목록 25개 cursor·빈/상태·취소/version·404/409 갱신을 검증하고 다른 사람 요청/회사명/관리자 상세가 노출되지 않음을 확인한다.
- [x] 수락 재인증의 잘못된 비밀번호와 세션 만료를 구분하고 제출 즉시 비밀번호를 삭제한다. 관리자 승인 뒤 본인 세션 401→재로그인→APPROVED/회사 접근과 반려 뒤 소속 없음·세션 유지 및 400/403/503/연결 오류의 안내/재시도를 검증한다.
- [x] label/status/alert·키보드 포커스·375/768/1440px 가로 넘침과 스크린샷을 확인한다. 로그인·기존 관리자 화면의 행동을 보존한다.
- [x] build·lint·전체 Appearance/E2E/API 회귀와 Mailpit/격리 DB 실제 흐름·기본 `/atms` 무변경을 확인한다. 실행 시점의 4173/4300 소스·readiness를 다시 확인하고 비밀번호/토큰 없는 실행 증거를 보존한다.

이 8개는 아래 실행 근거로 모두 PASS다. 본인 승인 설정·중지 소속 재활성화·가입/확인/복구 웹 화면·운영 이메일 배달과 상위 F01/F08 체크는 별도 후속이다.

## 코드 실행 흐름과 실패 처리

- `src/lib/api.ts`: 본인 응답은 관리자 requester 상세와 구분한다. 수락은 `{ token }`, 신청은 `{}`, 취소는 `{ version }`만 기존 API에 전달한다.
- `src/lib/companyInvitationToken.ts`: 모듈 로딩 시 Router 생성 전에 fragment를 제거한다. 두 StrictMode 초기 렌더가 같은 임시 값을 읽고 화면 commit에서 임시 변수를 지운다. 이후에는 화면 state만 사용하며 새로고침/화면 이탈 시 폐기된다.
- `src/components/auth/AccountLoginForm.tsx`: 제출 즉시 비밀번호를 지우고 AuthProvider가 로그인 세션을 반영한다. 일반 로그인은 보호 경로로 복귀하고 초대 화면은 이동 없이 다음 확인 화면을 표시한다.
- `src/pages/companies/AcceptCompanyInvitation.tsx`: 사용자 제출 → 비밀번호 재인증 → 초대 수락 → 이전 Query cache 삭제 → 교체 세션 적용 → ID/역할 표시와 결과 제목 포커스 순서다. Query mutation cache에는 비밀 입력을 저장하지 않는다. 비밀번호 401은 세션 GET으로 판별하며 실제 세션 401만 로그인 상태를 비운다. 400은 토큰 폐기, 그 외 오류는 고정 안내와 명시적 재시도다.
- `src/pages/companies/CompanyAccessRequests.tsx`: 로그인 사용자 ID별 Query cache와 25개 cursor를 사용한다. 신청은 UUID 검증 뒤 strict 빈 본문으로 제출하고, 취소는 화면의 ID/version 확인 후 실행한다. 404/409는 확인 대상을 닫고 첫 페이지부터 다시 조회하며 401은 인증·캐시를 정리한다. 확인 제목에 포커스를 이동하고 Escape/돌아가기는 시작 버튼으로 복귀한다.
- `src/components/companies/CompanyWorkspace.tsx`: `company.members.manage`에만 회사 ID 링크를 표시한다. clipboard 실패는 입력란 선택 복사로 대체한다. 링크 생성은 외부 전송이나 소속 부여를 실행하지 않는다.

## 실행 증거 — 2026-10-06

증거 디렉터리: `.artifacts/implementation-f01-company-self-access-browser/`. 최초 검증 8개 모두 PASS이며 실패 수리는 없었다. 서버/스키마/메일 계약과 기존 테스트는 변경하지 않았다.

| 조건 | 상태 | 재현 명령·구체적 근거 |
| --- | --- | --- |
| 1 확정·범위 | PASS | `node .artifacts/implementation-f01-company-self-access-browser/verify-contract.cjs` 종료 0; `contract-evidence.json` 값 8/파일 항목 15/조건 8/API 4·문서 링크·UTF-8 |
| 2 fragment·비밀 경계 | PASS | 전체 E2E의 신규 29개 중 fragment/loading/StrictMode/login/refresh/invalid/reentry, `contract-evidence.json` 영속 저장·mutation/query 제외, `live-evidence.json` fragmentRemoved/noStoredSecrets/explicitAcceptPosts=1 |
| 3 수락·세션·감사 | PASS | 실제 Mailpit 메일 1개·ACCOUNTANT/READ_ONLY·cookie/CSRF 교체·absoluteExpiryPreserved·다른 기기 401·INVITATION_ACCEPTED=1; API 회귀의 토큰 재사용/만료/취소/재발송/발행자·소속 검사 |
| 4 신청·링크·역할 | PASS | E2E UUID/빈 본문/회사 조회 배제·clipboard fallback/권한 제한·400/403/404/409/429/503/연결; live 신규 3개 신청 시 소속 0/승인 역할 EXTERNAL_TAX; API 동일 대기·기존 소속·반대 대기 회귀 |
| 5 본인 목록·취소 | PASS | E2E limit=25/cursor/5상태·404/409 후 버전2; live 요청 취소·ownResponsePrivacy 및 API 다른 요청자 취소 거부/스코프 cursor |
| 6 인증·실패 | PASS | E2E 비밀번호 401 유지/실제 만료 재로그인·입력 삭제·고정 오류/재시도; live 승인 기존 세션401→재로그인→회사 접근, 반려 세션200/소속0 |
| 7 접근성·화면 | PASS | E2E 확인 제목 포커스/Escape 복귀·375/768/1440px scrollWidth≤innerWidth; `own-access-{375,768,1440}.png`·`invitation-{375,768,1440}.png` 및 live 스크린샷 확인; 기존 관리자/로그인 회귀 포함 |
| 8 전체 회귀·현재 환경 | PASS | `npm run build`, `npm run lint`, `npm run test:appearance`, `npm run test:e2e`, `npm run test:api`, live 스크립트 모두 종료0; Appearance16/16·E2E63/63·API413/413(19파일); live UI4173/API4300=200·현재 Vite 모듈·기본 atms 12개 테이블 건수/내용 해시 전후 동일 |

비필수 후속의 미검증: 운영 SMTP 실배달, 실제 신규 가입/이메일 확인/복구 브라우저 화면은 이번 범위에서 구현·검증하지 않았다. Hindsight는 문서마다 수동 동기화하지 않으며 30분 예약 작업을 유지한다. 기존 `UiIcons.tsx:39` lint 경고 1개와 Vite 500kB 초과 chunk 경고는 남아 있으며 종료 코드는 0이다.

브라우저 확인: `http://127.0.0.1:4173/company-access`에서 본인 목록/회사 ID 신청, `/companies`에서 관리자 전달 링크·승인/반려, Mailpit `http://127.0.0.1:8025`에서 최신 초대 메일 링크를 열어 명시적 수락을 확인한다. 이미 사용한 메일은 재수락할 수 없으며 새 초대/재발송 링크가 필요하다.
