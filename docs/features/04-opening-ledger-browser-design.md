# 기초 잔액·전표 확정·원장 화면과 홈서버 반영 제안

작성일/확정일: 2026-10-07. 상태: **B1~B8 사용자 확정 / 구현·배포 착수**. 사용자가 B1~B8·기존 API6개·구현20파일·K1~K8·홈서버 반영과 가상 자료 생성 제시 직후 `확정`(`docs/IMPLEMENTATION_PLAN.md` 지정)으로 전체 범위를 선택했다.

영향 작업 ID: F04-02·05·08·09·10, F05-01·03·07, F08-09·13·14·15, F12. P-01·02·03·04·10, O1~O8의 기초 잔액 계약과 P1~P8의 POSTED·원장 계약을 그대로 사용한다. 기간 마감·마감 취소·정정 전표·재무제표·세무 집계는 이 묶음에서 제외한다.

[문서 인덱스](../README.md) · [구현 계획](../IMPLEMENTATION_PLAN.md) · [전표와 원장](04-journals-ledger.md) · [승인과 마감](05-approval-closing.md) · [기초 잔액 서버](04-opening-balance-foundation-design.md) · [POSTED·원장 서버](05-journal-posting-ledger-foundation-design.md)

## 현재 확인한 계약과 범위 경계

- 기초 잔액 서버는 회계연도별 OPENING 전표 하나를 GET/POST/PATCH로 제공한다. 대상 연도 시작일·KRW·적요는 서버가 고정하고, 가장 가까운 전기만 출처로 허용한다. 0원은 빈 분개·빈 증빙을 명시 확인하며 비영 잔액은 READY 증빙 1개 이상과 균형 분개가 필요하다.
- OPENING도 기존 DRAFT→SUBMITTED→APPROVED→POSTED 흐름과 본인 승인·역할 정책을 사용한다. 현재 workflow 응답은 다음 UI 묶음 전까지 `CONFIRM`을 `allowedActions`에서 제외하므로, 이번 범위에서는 서버가 현재 권한·상태를 재검사한 결과에 따라 `CONFIRM`을 반환하도록 경계 한 곳을 연다. 클라이언트가 역할이나 상태만 보고 확정 권한을 추론하지 않는다.
- 분개장과 계정별 원장은 POSTED 전표만 조회한다. 분개장은 선택적인 회계연도·기간·확정시각·계정·검색 필터와 합계를 제공한다. 계정별 원장은 회계연도와 계정이 필수이며 기초 잔액 상태, 조회 시작일 전 이월, 당기 움직임, 기말 잔액을 분리한다.
- 직전 서버 묶음에서 서버 790개·핵심 91개·DOM 176개·Appearance 16개 및 schema/타입/build/lint 검증을 통과했다. 직전 운영 배포 검증은 migration 16개·테이블 30개와 관련 서버/웹 코드를 확인했다. 이 과거 기록은 새 화면의 현재 운영 상태나 새 운영 시나리오 검증을 대신하지 않는다.
- 현재 `src/lib/api.ts`, `src/App.tsx`, Sidebar에는 기초 잔액·원장 클라이언트 타입/경로/메뉴가 없다. 승인 화면은 `CONFIRM` 이력을 표시할 수 있지만 확정 실행 버튼은 아직 없다.

## 제안 선택안 B1~B8

| ID | 제안 선택값 | 화면과 운영에 미치는 영향 |
| --- | --- | --- |
| B1 | `api.ts`에 기존 서버 API 6개의 타입·요청 함수를 추가한다 | 기초 잔액 GET/POST/PATCH, 확정 POST, 분개장 GET, 계정별 원장 GET을 기존 same-origin 쿠키·CSRF·AbortSignal·금액 문자열 계약으로 연결한다. |
| B2 | `/accounting/ledger`와 회계·세무 하위 메뉴 **“기초 잔액·원장”**을 추가한다 | 한 화면 안에 기초 잔액·분개장·계정별 원장 세 구역을 탭으로 제공한다. 회사 선택은 공통이고 회계연도·계정·필터는 각 구역 상태로 분리하며 URL에는 회사 ID와 선택 탭만 둔다. |
| B3 | 기초 잔액은 회계연도별 단일 전표로 등록·수정·승인 요청한다 | 회계연도 선택 시 존재 여부를 조회한다. 가장 가까운 전기는 읽기 전용으로 자동 선택한다. 0원은 별도 확인 체크 후 빈 분개/증빙으로 저장하고, 비영 잔액은 활성 계정 2~100행·차대 균형·READY 증빙 1~20개를 요구한다. DRAFT만 수정하며 저장 뒤 기존 workflow의 SUBMIT을 사용한다. |
| B4 | 승인 상세에서 서버가 허용한 APPROVED 전표만 POSTED로 확정한다 | workflow `allowedActions`에 `CONFIRM`이 있을 때만 “장부 반영” 확인 문구와 버튼을 표시한다. `version + actionRequestId`로 한 번만 처리하고 결과 불명 시 같은 요청으로 명시 재확인한다. 성공 후 승인·전표·기초 잔액·분개장·계정별 원장 캐시를 갱신하고 POSTED 원본은 수정하지 않는다. |
| B5 | 분개장은 POSTED 분개만 검색·조회한다 | 회계연도·회계일자·확정시각 UTC·계정·전표 번호/적요 필터, 기본 20·최대 100 cursor 이동, 차변·대변·순액 합계를 제공한다. 회계일자와 `postedAt`을 다른 열로 표시하고 전표 상세·증빙 경로로 이동한다. |
| B6 | 계정별 원장은 기초·이월·당기·기말을 분리 표시한다 | 회계연도와 활성/중지 포함 계정을 선택한다. `MISSING`은 기초 잔액 미등록, `CONFIRMED_ZERO`는 0원 확정, `POSTED`는 비영 기초 확정으로 번역한다. 조회 시작일 전 당기 움직임은 이월 잔액에 포함하고, 당기 행과 누적 잔액·기말 잔액을 서버 문자열 그대로 표시한다. |
| B7 | 권한 상실·경합·오류·접근성·반응형 복구 흐름을 검증한다 | 쓰기 중 중복 클릭과 회사/탭 전환을 잠근다. 401은 세션 종료, 403은 회사 권한 재확인, 404는 미등록/다른 회사 안내, 409는 최신 상태 재조회, 429/503/연결 오류는 자동 재전송 없이 재조회 또는 같은 요청 재확인을 제공한다. 375/768/1440px, 두 테마, 키보드·오류 포커스·44px 조작 영역과 긴 원장 행 넘침을 검증한다. |
| B8 | 전체 로컬 검증 후 기존 홈서버에 반영하고 분리된 가상 회사로 실제 브라우저 흐름을 검증한다 | 배포 직전 운영 행 지문·migration checksum을 다시 기록하고 외장 SSD 백업 및 임시 DB 복원 시험을 수행한다. SQL 추가 없이 API/정적 화면만 교체한다. 별도 가상 회사에서 0원/비영 기초 잔액과 일반 전표를 승인·확정하고 분개장/계정별 원장의 기초·이월·당기·기말 및 증빙 원본 경로를 UI/API/DB로 대조한다. 가상 자료는 검증 근거로 보존하며 기존 회사 업무 행과 설정은 바꾸지 않는다. |

B8의 운영 적용과 가상 회사·자료 생성은 새 선택이다. 직전 배포 지시는 완료된 작업 범위의 근거이며 이번 묶음의 배포 승인으로 확대하지 않는다. 이 제안을 확정하면 B1~B8 전체를 승인된 파일 순서로 구현한다.

## 연결할 기존 API 6개

| ID | 서버 경로 | 화면 연결 |
| --- | --- | --- |
| API-1 | GET `/api/companies/:companyId/fiscal-years/:fiscalYearId/opening-balance` | 선택 연도의 기초 잔액 조회; 404는 미등록 상태 |
| API-2 | POST `/api/companies/:companyId/fiscal-years/:fiscalYearId/opening-balance` | UUID 생성 요청 ID를 가진 최초 등록 |
| API-3 | PATCH `/api/companies/:companyId/fiscal-years/:fiscalYearId/opening-balance` | DRAFT의 현재 version을 사용한 전체 수정 |
| API-4 | POST `/api/companies/:companyId/journals/:journalId/confirm` | APPROVED→POSTED 장부 반영 |
| API-5 | GET `/api/companies/:companyId/ledger/journal-book` | POSTED 분개장·합계·cursor 조회 |
| API-6 | GET `/api/companies/:companyId/ledger/accounts/:accountId` | 계정별 기초·이월·당기·기말 원장 조회 |

기존 회사·회계연도·계정·증빙·전표·workflow 조회와 SUBMIT 경로도 재사용한다. 새 업무 API, DB schema, migration, 외부 라이브러리는 만들지 않는다.

## 구현 파일 20개와 목적

아래는 확정 후 수정·생성할 구현 파일이다. 요청받은 파일을 IDE에서 열고 변경 목적과 영역 주석을 표시한 뒤 순서대로 진행한다. 문서와 운영 산출물은 이 목록과 별도로 갱신한다.

| 순서 | 파일 | 목적 |
| --- | --- | --- |
| 1 | `server/src/journals/journal-workflow.service.ts` | 현재 권한·상태·본인 승인 설정을 통과한 `CONFIRM`을 workflow `allowedActions`에 노출 |
| 2 | `server/tests/journal-workflow-foundation.test.ts` | 역할5·본인 승인·회사/상태 경계에서 CONFIRM 노출과 실행 결과 검증 |
| 3 | `src/lib/api.ts` | 기초 잔액·확정·분개장·계정별 원장 타입과 API 6개 연결 |
| 4 | `src/lib/openingBalanceForm.ts` | 0원/비영·원 단위·행·균형·증빙·출처 연도 입력 검증과 서버 본문 변환 |
| 5 | `src/pages/accounting/Ledger.tsx` | 회사 선택·권한 재확인·세 탭·캐시/회사 격리·오류 복구의 페이지 조정 |
| 6 | `src/components/journals/OpeningBalanceForm.tsx` | 회계연도 단일 기초 잔액 조회·등록·DRAFT 수정·승인 요청 화면 |
| 7 | `src/components/journals/JournalBook.tsx` | 분개장 필터·합계·cursor 목록·전표/증빙 이동 |
| 8 | `src/components/journals/AccountLedger.tsx` | 계정 선택·기초 상태·이월/당기/기말·누적 잔액 목록 |
| 9 | `src/pages/accounting/Approvals.tsx` | 확정 실행·동일 요청 재확인·관련 캐시 무효화와 최신 상태 복구 |
| 10 | `src/components/journals/ApprovalDetail.tsx` | APPROVED/POSTED 상태와 확정 안내·원장 이동 표시 |
| 11 | `src/components/journals/ApprovalActionForm.tsx` | 서버 허용 CONFIRM의 명시 확인과 중복 실행 잠금 |
| 12 | `src/App.tsx` | 기존 인증 경계 아래 `/accounting/ledger` 경로 추가 |
| 13 | `src/components/layout/Sidebar.tsx` | “기초 잔액·원장” 실제 메뉴와 현재 위치 표시 |
| 14 | `tests/ledger.test.tsx` | 기초 잔액·분개장·계정 원장·회사/권한/오류 DOM 시험 |
| 15 | `tests/approvals.test.tsx` | CONFIRM 허용·재확인·경합·POSTED·캐시 회귀 시험 |
| 16 | `tests/e2e/ledger.spec.ts` | 메뉴·세 탭·역할5·375/768/1440·두 테마·접근성 브라우저 시험 |
| 17 | `tests/e2e/approvals.spec.ts` | 승인 상세의 확정 버튼·POSTED 표시·원장 이동 브라우저 회귀 |
| 18 | `tests/e2e/ledger.deployed.config.ts` | 기존 HTTPS를 대상으로 webServer 없이 실행하는 배포 시험 설정 |
| 19 | `.artifacts/implementation-f04-ledger-browser/rollout.sh` | 운영 지문·백업/복원 시험·API/웹 교체·건강 상태와 복구 근거 |
| 20 | `.artifacts/implementation-f04-ledger-browser/verify-completion.mjs` | K1~K8과 보호 범위·과거 근거·운영/실제 브라우저 결과 집계 |

## 구현 후 완료 검증 K1~K8

| ID | 객관적 완료 조건 | 예정 근거 |
| --- | --- | --- |
| K1 | API 6개의 경로·쿼리·본문·응답 타입·same-origin/CSRF/AbortSignal·금액 문자열이 서버 계약과 일치 | HTTP 모의 계약 시험과 파일·줄 번호 |
| K2 | 회계연도별 단일 기초 잔액의 미등록→등록→수정→요청 흐름, 전기 자동 출처, 0원/비영 검증과 동시 충돌이 정확 | DOM/서버 격리 시험, UI/API/DB 대조 |
| K3 | 역할5·본인 승인 설정·현재 상태에 따른 SUBMIT/CONFIRM 노출과 APPROVED→POSTED 단방향 처리·동일 요청 재확인이 정확 | 서버/DOM/실제 브라우저 시험, workflow/posting/감사 건수 |
| K4 | 분개장이 POSTED만 포함하고 필터·cursor·차변/대변/순액·회계일자/확정시각을 정확히 표시 | 서버 원본 응답·화면·DB 분개 대조 |
| K5 | 계정별 원장의 MISSING/CONFIRMED_ZERO/POSTED, 기초·이월·당기·누적·기말 잔액이 서버 Decimal 문자열 및 DB 계산과 일치 | 연도/기간/확정시각 경계별 API·UI·DB 비교 |
| K6 | 401/403/404/409/429/503·연결 오류와 회사/사용자 전환에서 이전 응답·본문 누출이나 자동 중복 쓰기 없이 복구 | DOM·브라우저 시험과 요청/감사 건수 |
| K7 | 메뉴 실제 진입, 키보드·label·오류 포커스·44px, 두 테마와 375/768/1440px에서 수평 넘침 없이 사용 가능 | Playwright 역할/뷰포트/테마 시험과 스크린샷 |
| K8 | 관련 서버/DOM/Appearance·schema/타입/build/lint 전체 묶음 통과, 기존 139 체크·16 migration·과거 근거·업무 행 보존, 운영 백업/복원·HTTPS·가상 시나리오 대조 완료 | 명령 종료 코드·시험 수·전후 해시/DB 지문·배포 브라우저 및 실제 UI 기록 |

첫 검증에서 FAIL+UNVERIFIED가 2개를 넘으면 가장 앞선 실패 계층에서 수리를 멈춘다. 2개 이하이면 근본 원인을 수정한 뒤 K1~K8 전체를 다시 실행한다. 모든 조건 PASS 전에는 이 묶음이나 F04/F05/F12 상위 항목을 완료로 표시하지 않는다. Hindsight는 기존 30분 예약 실행에 맡긴다.

## 사용자 확정 기록

2026-10-07 사용자가 이 구체적 제안에 `확정`(`docs/IMPLEMENTATION_PLAN.md` 지정)으로 응답했다. 확정값은 B1~B8 전체, 기존 API 6개, 구현 파일 20개, K1~K8, 홈서버 API/웹 반영과 분리된 가상 검증 자료 생성이다. 영향 작업 ID는 F04-02·05·08·09·10, F05-01·03·07, F08-09·13·14·15, F12다.
