# F01·F08 회사 관리 첫 브라우저 화면

## 새 회사 등록 자격증명 자동완성 수리 확정 — 2026-10-07

운영 `https://atms.approid.team/companies`에서 Chrome이 `new-company-name`에 로그인 이메일을, `company-create-password`에 저장된 현재 비밀번호를 자동 입력하는 현상을 확인했다. 폼의 React 초기 상태는 네 필드 모두 빈 문자열이고 회사/회계연도 Prisma 모델과 생성 API에는 이름·기간 기본값이 없으므로, 서버 자료가 아니라 동일 form 안의 미지정 회사명 입력과 `autocomplete="current-password"` 조합을 자격증명 폼으로 해석한 브라우저 자동완성이 원인이다.

사용자가 원인 설명에 “그거야”, 구체적인 수리 범위 제시 뒤 “커밋 푸시하고 배포해”라고 지시해 다음 값을 확정했다.

- 영향 ID: F01-01, F08-09, F08-14, F08-15의 회사 등록 화면 부분.
- 회사명·시작일·종료일은 빈 controlled state와 성공 후 초기화를 유지하고 자동완성을 끈다.
- 재인증 비밀번호는 저장 자격증명 자동 입력을 요청하지 않도록 별도 필드 이름과 `new-password` 자동완성 목적을 사용한다. 사용자는 등록 시 현재 비밀번호를 직접 입력한다.
- Prisma schema, 회사 생성 API, 재인증 API, DB 자료는 변경하지 않는다.
- 구현 파일은 `src/components/companies/CompanyCreateForm.tsx`, `tests/e2e/company-management.spec.ts` 2개다. 확정·완료 기록은 `docs/IMPLEMENTATION_PLAN.md`, 이 문서, 배포 결과 문서에 남긴다.

완료 조건은 (1) 최초 렌더의 네 값이 비어 있음, (2) 회사명·기간에 자동완성 차단과 고유 name 적용, (3) 재인증 비밀번호가 저장된 현재 자격증명을 자동 요청하지 않음, (4) 기존 등록·오류 초기화 E2E 통과, (5) build·lint·DOM·Appearance 전체 통과, (6) 배포 후 운영 DOM 속성과 빈 필드 확인이다.

로컬 구현·검증 완료(2026-10-07): `CompanyCreateForm.tsx`에 form·회사명·시작일·종료일의 자동완성 차단과 고유 `name`, 재인증 필드의 `companyCreationPassword`/`new-password`를 적용했다. 관련 Playwright 13/13, DOM176/176, Appearance16/16, build/lint 종료0이다. 운영 DOM 속성과 실제 빈 필드는 배포 후 최종 확인한다.

[문서 인덱스](../README.md) · [회사 서버 기반](01-company-foundation-design.md) · [회사와 사용자 권한](01-company-access.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **회사 관리 첫 브라우저 부분 구현·검증 완료**. 확정일·완료일: 2026-10-06. 사용자 확정 근거: 회사 목록·등록·선택·이름 수정·회계연도와 오류·반응형·격리 DB 검증 범위를 제시한 뒤 “확정”. 영향 ID: F01-01·F01-04·F01-06 및 F08-09·F08-14·F08-15의 회사 관리 화면 부분.

## 확정한 범위와 경계

1. `/companies`에서 접근 가능한 회사 목록을 조회하고, 사용자가 명시적으로 선택한 회사의 역할·권한·상세를 표시한다.
2. 서버의 `POST /companies/:companyId/select`는 세션 전역 선택값을 저장하지 않으므로 화면도 “이 화면에서 관리할 회사”로 표현한다. 다른 화면이 이 값을 신뢰하거나 권한 판정에 사용하지 않는다.
3. 현재 비밀번호를 `POST /auth/reauthenticate`로 다시 확인한 세션과 CSRF로 회사 이름·첫 회계연도를 등록한다. 비밀번호는 저장·로그·오류에 남기지 않고 제출 직후 화면 상태에서도 지운다. 브라우저에서 생성한 UUID를 재시도 식별자로 유지하고, 성공 응답의 교체된 세션·CSRF를 즉시 인증 컨텍스트에 반영한다.
4. `company.manage` 권한이 있는 선택 회사만 이름 수정과 회계연도 추가 폼을 표시한다. 조회 전용 사용자는 상세와 기간 목록만 본다.
5. 이름 수정과 기간 추가는 화면이 읽은 최신 `company.version`을 전송한다. 409이면 회사·목록·기간을 다시 읽고 사용자가 최신 값으로 재시도하도록 안내한다.
6. 로딩·빈 목록·일반 오류/재시도·401 로그인 복귀, 비밀번호 재확인 실패, 403 권한·400 입력·409 충돌을 빈 화면 없이 구분한다.
7. 375px에서는 단일 열, 768px 이상에서는 목록과 상세를 나누며 키보드 포커스·label·status/alert·44px 조작 영역을 유지한다.
8. 구성원·초대·접근 요청·역할 변경·소속 중지·본인 승인 설정과 회사 삭제/기간 수정·삭제는 다음 묶음이다.

## 구현 파일 항목 14개

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `src/lib/api.ts` | 회사 선택·생성·수정·회계연도 API 타입과 CSRF 요청 |
| 수정 | `src/context/AuthContext.tsx` | 회사 생성 후 서버가 교체한 세션·CSRF 반영 |
| 수정 | `src/App.tsx` | 보호 경로 `/companies` 연결 |
| 수정 | `src/components/layout/Sidebar.tsx` | 회사 관리 메뉴 연결 |
| 생성 | `src/components/companies/CompanyCreateForm.tsx` | 회사 이름·첫 회계연도·현재 비밀번호 재확인과 비저장 안내 |
| 생성 | `src/components/companies/CompanyWorkspace.tsx` | 선택 회사 상세·역할/권한·이름 수정·기간 목록/추가 |
| 생성 | `src/pages/companies/CompanyManagement.tsx` | 회사 목록·선택·mutation/query 조합과 상태 처리 |
| 수정 | `tests/e2e/appearance.spec.ts` | 회사 메뉴 추가 후 모바일 탐색 회귀 유지 |
| 생성 | `tests/e2e/company-management.spec.ts` | 목록·선택·생성·세션 교체·수정·충돌·권한·반응형 검증 |
| 생성 | `.artifacts/implementation-f01-company-browser/live-company-check.cjs` | 격리 DB 실제 쓰기 흐름과 스크린샷 검증 |
| 생성 | `docs/features/01-company-browser-design.md` | 사용자 확정값·경계·파일·검증 근거 |
| 수정 | `docs/features/01-company-access.md` | 회사 화면 부분 상태와 후속 범위 연결 |
| 수정 | `docs/README.md`·`docs/ROADMAP.md` | 문서 인덱스와 현재 구현 상태 연결 |
| 수정 | `docs/IMPLEMENTATION_PLAN.md` | 영향 작업의 부분 구현·검증 기록 |

## 구현 후 묶어서 검증할 조건 8개

- [x] **PASS** — 사용자 “확정”, 2026-10-06, 영향 ID·14개 파일 항목과 후속 경계를 이 문서와 계획 문서에 기록했다.
- [x] **PASS** — E2E와 실제 DB가 활성 소속 목록·명시적 선택·조회 전용/관리자 역할과 권한별 폼 표시를 확인했다.
- [x] **PASS** — 생성 UUID·비밀번호 재확인·기존 CSRF와 생성 후 교체 CSRF·새로고침 세션 복원을 검증했다.
- [x] **PASS** — 이름 수정 v1→v2와 409 후 GET 상세 재조회·최신 이름/버전 반영을 검증했다.
- [x] **PASS** — 첫 기간과 추가 기간 v2→v3, 1~366일 입력·빈 기간·중복 409·기존 기간 보존을 검증했다.
- [x] **PASS** — 로딩·빈 목록/기간·503 재시도·재확인 401·세션 401·권한 403·입력 400·충돌 409 계약을 검증했다.
- [x] **PASS** — label/role/alert/status·키보드 탐색과 375·768·1440px 가로 넘침 없는 화면 및 스크린샷을 확인했다.
- [x] **PASS** — build·lint, Appearance 16개, 브라우저 18개, API 413개와 격리 DB 실제 쓰기가 통과했다. 기본 `/atms` 검증 자료는 0건이다.

실제 증거는 `.artifacts/implementation-f01-company-browser/live-company-evidence.json`과 `company-live-database.png`에 기록했다. 이번 회사 관리 화면 부분만 완료이며 상위 F01/F08 체크와 후속 회사 관리 기능은 유지한다.
