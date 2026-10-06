# F08-09·14·15 첫 브라우저 묶음: 규칙 적용 현황

[문서 인덱스](../README.md) · [공통 시스템 기반](08-platform.md) · [규칙 버전 기반](13-rule-version-foundation-design.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **첫 읽기 전용 브라우저 부분 구현·검증 완료**. 확정일·완료일: 2026-10-06. 사용자 확정 근거: 브라우저 검증까지 진행할 구체 범위와 격리 DB 방식을 제시한 뒤 “확인”. 영향 ID: F08-09·F08-14·F08-15의 첫 실제 업무 화면 부분과 F13-01~03 규칙 조회 화면 부분.

## 확정한 범위

1. 첫 업무 화면은 `/accounting/rules`의 회사별 규칙 적용 현황이다.
2. 실제 `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout`, `GET /api/companies`, `GET /api/companies/:companyId/rule-applications`를 사용한다.
3. 회사 선택, 기준일, 회계/세무 구분, 문자열 검색, cursor 이전·다음 페이지와 규칙·버전·공식 근거·아티팩트 상세를 제공한다.
4. 로딩·빈 결과·실패·재시도·세션 만료 상태를 빈 화면 없이 명시한다.
5. 이번 화면은 조회 전용이다. 규칙 작성·검토·승인·활성화와 실제 세율·계산식·법령 해석·신고 서식 입력은 구현하지 않는다.
6. 기존 Pretendard·Light/Dark/System·강조색 계약을 유지하고, 375px·768px에서는 카드, 1440px에서는 표를 사용한다.
7. 브라우저 검증 자료는 기본 `/atms`와 분리한 임시 로컬 DB에만 넣는다. 검증용 회사·계정·규칙은 공식 자료가 아니며 검증 종료 후 제거한다.
8. F08-09·14·15 전체는 다른 업무 목록·입력 화면과 공통화가 남으므로 이번 부분 완료만 기록하고 상위 체크는 유지한다.

## 사용자 흐름

미인증 사용자는 `/login`으로 이동한다. 로그인 성공 후 원래 요청한 주소로 돌아가며, 새로고침 시 세션 API로 인증을 복원한다. 규칙 화면은 접근 가능한 회사 목록을 먼저 읽고 선택한 회사의 적용 규칙을 조회한다. 인증 만료는 로그인으로 돌아가며 일반 조회 오류는 같은 화면의 재시도 버튼으로 복구한다.

검색과 도메인 필터는 현재 받은 페이지 안에서 동작하고 기준일·회사·cursor 변경은 서버 조회를 다시 실행한다. 이전 cursor는 화면의 스택으로만 관리하며 서버가 제공한 cursor를 변조하지 않는다. 규칙이 없으면 임의 기본 규칙을 보여주지 않고 빈 결과 안내를 표시한다.

## 실제 구현 파일 항목 17개

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 생성 | `src/lib/api.ts` | credentials·공통 오류·인증/회사/규칙 응답 타입과 API 함수 |
| 생성 | `src/context/AuthContext.tsx` | 세션 복원·로그인·로그아웃과 인증 상태 |
| 수정 | `src/main.tsx` | QueryClient와 AuthProvider 연결 |
| 수정 | `src/App.tsx` | 보호 레이아웃과 `/accounting/rules` 경로 연결 |
| 수정 | `src/pages/auth/Login.tsx` | 실제 로그인·오류·원래 경로 복귀 |
| 수정 | `src/layouts/MainLayout.tsx` | 인증 복원 중 상태와 보호된 공통 레이아웃 |
| 수정 | `src/components/layout/Header.tsx` | 실제 사용자·로그아웃 연결 |
| 수정 | `src/components/layout/Sidebar.tsx` | 회계·세무 메뉴와 규칙 적용 현황 진입 |
| 생성 | `src/components/common/AsyncState.tsx` | 접근 가능한 로딩·빈 결과·실패·재시도 상태 |
| 생성 | `src/components/rules/RuleApplicationTable.tsx` | 반응형 표/카드·상세·cursor 이동 |
| 생성 | `src/pages/accounting/RuleApplications.tsx` | 회사·기준일·도메인·검색과 서버 조회 조합 |
| 생성 | `tests/e2e/rule-applications.spec.ts` | 인증·목록·빈 결과·오류·모바일·키보드 브라우저 검증 |
| 생성 | `.artifacts/implementation-f08-accounting-browser/browser-fixture.cjs` | 격리 DB·가상 계정·규칙과 로컬 검증 서버 준비/정리 |
| 수정 | `tests/e2e/appearance.spec.ts` | 보호 경로 도입 후 기존 외형 검증에 고정 인증 세션 준비 |
| 생성 | `eslint.config.js` | ESLint 9 flat config로 TypeScript 정적 검사 실행 |
| 수정 | `package.json`·`package-lock.json` | ESLint TypeScript 파서 의존성 고정 |
| 수정 | `docs/README.md`·`docs/ROADMAP.md`·`docs/IMPLEMENTATION_PLAN.md`·`docs/features/08-platform.md` | 확정 범위·실행 결과·남은 경계 연결 |

최초 확정한 14개 항목에 검증 중 발견한 ESLint 9 설정 부재와 보호 경로의 기존 E2E 준비 문제를 근본 계층에서 해결하기 위한 3개 항목을 추가했다. 제품 업무 범위는 읽기 전용 규칙 현황으로 유지했다.

## 구현 후 묶어서 검증할 조건 8개

- [x] **PASS** — 이 문서에 사용자 “확인”, 2026-10-06, 영향 ID와 실제 17개 파일 항목을 기록했다.
- [x] **PASS** — `live-browser-check.cjs`가 실제 로그인 후 새로고침 세션 복원과 CSRF 로그아웃을 완료했다.
- [x] **PASS** — 격리 DB의 접근 가능 회사 2개를 표시하고 규칙 회사 2건·빈 회사 0건을 각각 확인했다.
- [x] **PASS** — Playwright가 기준일 계약·도메인·검색·cursor 이전/다음·상세 펼치기를 검증했다.
- [x] **PASS** — Playwright가 로딩·빈 결과·503 오류/재시도·401 로그인 복귀를 검증했다.
- [x] **PASS** — 키보드·상태 role과 375·768 카드, 1440 표를 검증하고 가로 넘침이 없음을 확인했다.
- [x] **PASS** — `npm run build`, `npm run lint`, Appearance 16개, 브라우저 12개, API 413개가 통과했다.
- [x] **PASS** — `atms_browser_f08_*` 격리 DB에서 실제 화면을 검증하고 `rules-live-database.png`를 저장했다.

검증 환경은 사용자가 직접 확인할 수 있도록 로컬 `127.0.0.1:4173`에 유지한다. 종료 후 `browser-fixture.cjs cleanup`으로 전용 임시 DB를 제거하며 기본 `/atms`와 운영 환경에는 검증 자료를 넣지 않는다. F08-09·14·15의 다른 업무 목록·입력은 후속이므로 상위 체크는 유지한다.
