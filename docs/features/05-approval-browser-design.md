# 승인 요청·처리 화면과 홈서버 반영 제안

작성일: 2026-10-07. 상태: **A1~A8 사용자 확정 / 해당 묶음 구현·운영 검증 완료**. 확정일: 2026-10-07. 확정 근거: 사용자가 전체 A1~A8 제안과 운영 반영·가상 회사 생성 질문에 `확정`(`src/lib/api.ts` 지정)으로 응답했다. 영향 작업 ID: F05-01·02·03·07, F04-05·07, F08-09·14·15, F12.

사용자 요청 “다음”(src/lib/api.ts 지정)에 따라 [완료된 첫 승인 서버 묶음](05-journal-approval-foundation-design.md)을 화면에 연결하는 범위를 제시한다. “다음”은 아래의 새 화면·운영 적용·가상 자료 생성 범위를 확정한 말로 해석하지 않는다. 선행 정책 P-01·02·03·04·10과 W1~W8의 1단계 승인·본인 승인·제출본 불변·재요청 계약은 유지한다. 영향 작업은 F05-01·02·03·07의 승인 화면 부분, F04-05·07의 초안 상태 호환, F08-09·14·15의 메뉴·화면·조회 상태, F12 배포 검증이다. POSTED 확정·원장·마감·정정과 F04/F05/F12 전체 완료는 포함하지 않는다.

[문서 인덱스](../README.md) · [구현 계획](../IMPLEMENTATION_PLAN.md) · [승인과 마감](05-approval-closing.md) · [배포](12-deployment.md)

## 지금 확인한 계약과 운영 기준

- [승인 서버 결과](../../.artifacts/proposal-f05-journal-approval/results.json)는 K1~K8 PASS다. 기존 초안 5경로는 유지되며, 승인 6경로는 현재 `src/lib/api.ts`에 아직 없다. `GET /journal-approval-requests`는 기본 SUBMITTED 목록, `GET /journals/:id/workflow`는 현재 전표·`allowedActions`·제출본/이력을 반환한다. 쓰기 4경로는 `version`·`actionRequestId`와 반려 시 `reason`을 받는다.
- 현재 초안 화면은 비초안 수정 제한을 표시하지만 승인 요청 버튼과 승인 목록 메뉴는 없다. 서버 `allowedActions`가 회사의 현재 소속·권한·본인 승인 설정을 반영한다. 화면은 그 결과로 버튼을 결정하고 실행 시 서버가 다시 판단한다.
- 2026-10-07 읽기 전용 운영 조회: 공개 `/api/health/ready` HTTP 200, 홈서버의 완료 마이그레이션 13개·public 테이블 27개, `/mnt/external-ssd/backups/johae-server/atms` 디렉터리 존재·쓰기 가능. 이는 배포 전 상태이며 새 승인 SQL/API가 운영에 반영됐다는 뜻이 아니다. 배포 직전 같은 항목과 원래 업무 행 지문을 다시 읽는다.

## 확정한 선택안 A1~A8

| ID | 선택안 | 화면과 운영에 미치는 영향 |
| --- | --- | --- |
| A1 | `api.ts`에 승인 6경로의 타입·요청 함수를 추가한다 | 기존 `requestJson`의 same-origin 쿠키·CSRF·안전 오류, 금액 문자열, 조회 AbortSignal을 재사용한다. 서버가 정한 상태·처리자·시각을 클라이언트 입력으로 만들지 않는다. |
| A2 | 초안 상세에서 승인 요청을 시작한다 | 현재 `workflow.allowedActions`에 SUBMIT이 있을 때만 요청 버튼을 보여준다. 성공 시 초안 목록·증빙 역조회·승인 목록·두 상세 캐시를 갱신하고 현재 상태를 표시한다. 초안 목록에서 사라진 전표는 승인 화면의 같은 회사 상세로 이동할 수 있다. |
| A3 | `/accounting/approvals`와 회계·세무 메뉴에 “전표 승인”을 추가한다 | 회사 선택 후 SUBMITTED 기본 목록과 APPROVED·REJECTED 상태 필터, 회계연도·회계일자·번호/적요 검색, 기본20/최대100·cursor 앞/뒤 이동을 제공한다. 다섯 역할의 `journal.read` 조회를 허용하되 쓰기 버튼은 각 작업의 `allowedActions`만 따른다. 회사/사용자/필터 변경 시 이전 회사 응답과 캐시를 분리한다. |
| A4 | 승인 상세에 현재 전표, 제출 당시 분개·증빙, 처리 이력을 분리 표시한다 | 회계일자(DATE)와 처리 시각(서버 UTC)을 구분한다. 반려 사유와 처리자 ID, 제출본 버전을 볼 수 있다. 증빙 원본은 기존 권한 확인 경로로 이동하며 원본 바이트·파일 키를 승인 캐시에 넣지 않는다. `APPROVED`를 장부 확정 또는 세무 반영이라고 표시하지 않는다. 이력은 서버 cursor로 더 조회한다. |
| A5 | APPROVE·REJECT·RETURN_TO_DRAFT를 화면에서 실행한다 | 서버 `allowedActions`와 현재 version이 있는 경우만 조작한다. 반려는 trim 후1~500 코드 포인트 사유를 명시 입력하고 확인한다. 작성자 본인 승인 금지·회사별 허용과 외부 세무사 단독 역할의 요청 불가 등은 기존 서버 권한을 그대로 노출한다. 승인/반려·초안 복귀의 결과는 현재 상태·이력·목록에 반영한다. |
| A6 | 중복 클릭·결과 미확인·경합의 복구 계약을 적용한다 | 쓰기 중 버튼/회사 전환을 잠그고 자동 재전송하지 않는다. 전송 결과를 알 수 없으면 같은 `actionRequestId`·원래 본문으로 “같은 요청으로 결과 확인”을 명시 제공한다. 저장된 요청은 현재 화면 메모리에만 두며 local/sessionStorage·로그에 업무 본문/사유/요청 ID를 넣지 않는다. 409는 현재 상태를 다시 읽고 새 작업 가능 여부를 보여주며 임의 덮어쓰기를 하지 않는다. 401은 기존 세션 종료, 403은 회사 권한 재확인, 404는 다른 회사/없는 전표 안내, 429/503/연결 오류는 안전한 재조회 흐름을 사용한다. |
| A7 | 기존 HUD/Appearance에 맞춰 반응형·접근성을 검증한다 | 375/768/1440px와 밝음/어두움에서 목록·상세가 넘치지 않아야 한다. 실제 링크로 메뉴에 진입하고 현재 위치를 표시한다. 입력 label/오류 연결, 44px 이상 조작 영역, 키보드 이동·오류 포커스·상태 알림을 검증한다. 서버 이력의 긴 적요·반려 사유도 잘림 없이 읽을 수 있어야 한다. |
| A8 | 로컬 시험 뒤 승인 SQL/API/정적 화면을 기존 홈서버에 반영하고 가상 회사로 실제 브라우저를 검증한다 | 배포 직전 운영 DB 행 지문·13개 migration checksum/27테이블을 다시 기록하고 외장 SSD에 DB dump·현재 API 이미지·정적 파일을 백업한다. dump를 별도 임시 DB에 복원해 추가 SQL `20261007020000_journal_approval_foundation` 적용, 기존 행 보존, 예상14 migration/29테이블을 확인한다. 새 API와 웹을 기존 포트/도메인에 적용해 health/HTTP/실제 메뉴를 검사한다. 기존 업무 회사와 분리된 이름이 분명한 **가상 승인 검증 회사**를 만들고, 해당 회사에서 본인 승인 허용을 켠 뒤 가상 계정2·소형 증빙1·초안2로 요청→반려→복귀·수정→재요청→승인을 실제 UI에서 검증한다. 가상 자료와 감사 이력은 검증 근거로 보존하며 기존 회사의 본인 승인 설정·업무 행은 바꾸지 않는다. 다섯 역할은 네트워크 모의 브라우저 시험으로 별도 검증한다. 실패 시 기존 API/정적 파일 복구 가능성을 확인하고, 새로운 업무 쓰기를 잃을 수 있는 DB 자동 복원은 수행하지 않는다. |

A8의 운영 적용과 새 가상 회사·자료 생성은 이 제안의 새로운 선택이다. 승인 서버 첫 묶음의 W1은 그 당시 운영 적용을 제외했고, 이번 A8 확정 시에만 새로운 운영 작업 범위가 된다. 서버 권한·상태·업무 값은 화면이 바꾸지 않는다. 운영 접속 상태·테이블 수·백업 여유 공간·사용자 세션은 배포 직전에 다시 확인하며 이전 기록을 현재 상태로 간주하지 않는다.

## 연결할 기존 승인 API 6개

| ID | 서버 경로 | 화면 연결 |
| --- | --- | --- |
| API-1 | GET `/api/companies/:companyId/journal-approval-requests` | 상태·회계연도·기간·검색·cursor 목록 |
| API-2 | GET `/api/companies/:companyId/journals/:journalId/workflow` | 현재 상세·허용 작업·제출본/처리 이력·이력 cursor |
| API-3 | POST `/api/companies/:companyId/journals/:journalId/submit` | 초안 승인 요청 |
| API-4 | POST `/api/companies/:companyId/journals/:journalId/approve` | 제출 전표 승인 |
| API-5 | POST `/api/companies/:companyId/journals/:journalId/reject` | 제출 전표 반려와 사유 |
| API-6 | POST `/api/companies/:companyId/journals/:journalId/return-to-draft` | 반려 전표의 명시적 초안 복귀 |

기존 초안 API5개와 회사·회계연도·계정·증빙 조회는 재사용한다. 승인 화면은 별도 서버 권한을 만들지 않는다.

## 예정 파일 15개와 목적

이 목록은 구현 전에 사용자에게 제시하는 수정·생성 대상이다. 코드 파일의 목적 주석과 변경 영역을 표시하고, 완료 보고 때 파일·줄 번호로 실행/실패 흐름을 설명한다. 담당 개발 문서와 인덱스는 별도로 갱신한다.

| 순서 | 파일 | 목적 |
| --- | --- | --- |
| 1 | `src/lib/api.ts` | 승인 응답/본문 타입·6개 요청 함수와 기존 안전 오류/CSRF 재사용 |
| 2 | `src/pages/accounting/Journals.tsx` | 초안 상세의 서버 허용 작업 조회·승인 요청·재확인·캐시 갱신 |
| 3 | `src/components/journals/JournalDetail.tsx` | 초안 상세의 요청 버튼과 승인 화면 이동 링크 |
| 4 | `src/pages/accounting/Approvals.tsx` | 회사/권한/목록·상세·작업·오류/빈 상태·캐시와 URL 처리 |
| 5 | `src/components/journals/ApprovalQueue.tsx` | 상태·기간·검색/연도 필터, cursor 페이지와 반응형 목록 |
| 6 | `src/components/journals/ApprovalDetail.tsx` | 현재 전표·제출본·처리 이력·증빙 연결과 더 보기 |
| 7 | `src/components/journals/ApprovalActionForm.tsx` | 승인/반려/초안 복귀, 반려 사유, 미확인 요청의 명시적 재확인 |
| 8 | `src/App.tsx` | 기존 인증 경계 아래 새 승인 경로 |
| 9 | `src/components/layout/Sidebar.tsx` | 실제 “전표 승인” 메뉴와 현재 위치 표시 |
| 10 | `tests/approvals.test.tsx` | 회사·역할5·작업/반려/재시도·경합/권한 상실 DOM 시험 |
| 11 | `tests/journals.test.tsx` | 기존 초안 및 승인 요청 진입·상태 호환 회귀 |
| 12 | `tests/e2e/approvals.spec.ts` | 실제 메뉴 진입·역할5·키보드·375/768/1440·두 테마 브라우저 시험 |
| 13 | `tests/e2e/approvals.deployed.config.ts` | 기존 HTTPS 대상, webServer 없이 배포 브라우저 시험 |
| 14 | `.artifacts/implementation-f05-approval-browser/rollout.sh` | 운영 전후 지문·백업/복원 시험·추가 SQL/API/웹 배포와 실패 복구 기록 |
| 15 | `.artifacts/implementation-f05-approval-browser/verify-completion.mjs` | 8조건 집계, 과거 증빙 복원, 운영/실제 브라우저 근거 검증 |

## 구현 후 완료 검증 K1~K8 — PASS (2026-10-07)

| ID | 객관적 조건 | 예정 근거 |
| --- | --- | --- |
| K1 | `api.ts` 6경로가 서버 타입·쿼리/본문·same-origin/CSRF·금액 문자열과 일치 | HTTP 모의 계약 시험, 파일·줄 번호 |
| K2 | 초안 상세 요청과 목록 이동, 상태 전후 캐시·새로고침·두 회사 분리가 정확 | DOM/배포 브라우저 시험과 서버/DB 상태 대조 |
| K3 | SUBMITTED/APPROVED/REJECTED 목록·검색·기간·cursor와 제출본/반려 사유·UTC 시각/증빙 상세가 정확 | DOM/브라우저·원본 응답 비교 |
| K4 | 역할5·본인 승인 설정·`allowedActions`와 반려 사유/명시적 복귀가 화면·서버 결과와 일치 | 역할 모의 브라우저·격리 서버 시험/운영 가상 회사 기록 |
| K5 | 같은 작업 ID의 명시적 재확인, 중복 클릭/동시 처리409/401/403/404/429/503 오류에서 새 상태를 안전하게 안내 | DOM·브라우저 시험, 저장 이력/감사 건수 |
| K6 | 메뉴 실제 진입, 키보드/label/오류 포커스, 두 테마와375/768/1440에서 넘침 없이 사용 가능 | 브라우저 6뷰포트/테마 조합·스크린샷 |
| K7 | 관련 코드 전체 검증 묶음 통과, 과거 시험 근거와 체크 상태 보존 | 서버/DOM/Appearance 시험 수·타입/schema/build/lint 종료 코드, 원본 해시/139체크 |
| K8 | 운영 전 백업·임시 DB 복원 시험·14migration/29테이블·기존 업무 행 보존·공개 HTTPS/실제 가상 회사 처리 | dump/manifest/hash·전후 운영 읽기 지문·실제 UI/DB 대조·배포 브라우저 시험 |

첫 검증에서 FAIL+UNVERIFIED가 2개를 넘으면 AGENTS.md 완료 게이트에 따라 수리를 멈추고 가장 앞선 실패 계층을 보고한다. 2개 이하이면 근본 원인을 고쳐 K1~K8 전체를 다시 실행한다. 모든 필수 조건 PASS 전에는 완료로 표시하지 않는다. 제안 문서의 사전 검증 D1~D4는 이 K조건을 대신하지 않는다. Hindsight는 기존 30분 예약에 맡긴다.

### 실제 완료·운영 대조

[최종 검증 결과](../../.artifacts/implementation-f05-approval-browser/results.json)는 K1~K8 모두 PASS다. 서버 774/774, 관련 DOM 176/176, Appearance 16/16, 로컬·배포 브라우저 각각 12/12와 build/lint/schema·테스트 정합성 검사 종료 코드 0을 확인했다. 기존 보호 파일 293개 중 계획한 6개만 바뀌었고 구현 계획의 체크 139개 행은 일치한다. 기존 서버 13개 migration·27개 테이블을 SSD 백업하고 격리 DB에서 복원·추가 SQL을 시험한 뒤 운영에 14개 migration·29개 테이블을 적용했다. 기존 업무 25개 테이블의 전후 행 지문이 일치하며 공개 ready·승인 화면은 HTTP 200, 미인증 승인 API는 401이다. 실제 웹 index의 SHA-256도 로컬 빌드와 일치한다.

[읽기 전용 운영 대조](../../.artifacts/implementation-f05-approval-browser/live-db.json)와 [재현 가능한 가상 시나리오 검증](../../.artifacts/implementation-f05-approval-browser/live-scenario.json)에서 분리된 회사 `7bb08c96-4b12-444c-ac5e-7a149496c14a`의 본인 승인 허용·계정 2개·전표 2개를 확인했다. 전표 A `db36a818-c8ef-4bbf-84b4-b71583ee23ba`는 실제 화면에서 요청→반려→초안 복귀→적요/금액/증빙 수정→재요청→승인을 거쳐 APPROVED/version 8이다. 최초 제출본은 1,000원/증빙 없음, 재요청 제출본은 1,500원/가상 PDF 1개로 각각 보존됐다. 연결 PDF의 저장 지문은 준비한 619바이트 원본과 같다. 전표 B는 SUBMITTED/version 2로 남겨 목록 분리를 확인했다. 기존 `Approid 테스트` 회사는 version 1·본인 승인 금지이고 검증일에 회사 감사 이벤트가 0건이다.

파일 선택을 사용자와 나누어 진행하는 과정에서 가상 회사에 전표와 연결되지 않은 증빙 2건(JPG 1건, 같은 가상 PDF 1건)이 추가로 남았다. 그 원본 내용은 열지 않았고 전표 A에는 준비한 가상 PDF ID `d0c7468d-13e7-45c7-8b67-2b55e8d3e995`만 연결했다. 별도 삭제는 수행하지 않았다. 이 작업은 F05 승인 화면·F12 배포의 부분 완료이며 POSTED 확정·원장·기초 잔액·마감·정정과 전체 기능 체크는 계속 미완료다. Hindsight는 기존 30분 예약 실행에 맡긴다.

실제 초안→승인 링크 진입에서 단건 workflow 조회와 무한 이력 조회가 같은 캐시 키를 쓰면 화면이 비는 결함을 발견했다. `src/pages/accounting/Approvals.tsx`의 이력 키를 `approval-workflow-history`로 분리하고 양쪽 화면의 캐시 무효화·회사 전환 정리 및 배포 브라우저 회귀 시험을 추가했다. 수정한 정적 화면을 운영에 다시 반영한 뒤 전체 K1~K8을 재검증했다.

초기 15개 파일 목록 밖의 운영 보조 파일은 같은 검증 묶음에 속한다. `.artifacts/implementation-f05-approval-browser/compare-fingerprint.py`는 격리/운영 업무 행 지문을 비교하고, `remote-status.sh`와 `live-readonly.sh`·`live-verify.sql`은 운영 상태와 가상 회사 자료를 읽기 전용으로 수집한다. `rollout-web-fix.sh`는 캐시 수정 후 정적 화면만 백업·재반영하고, `build-live-scenario.mjs`는 읽기 전용 DB 결과·가상 PDF 지문을 검사해 `live-scenario.json`을 만든다. `approval-verification-20261007.pdf`는 실제 UI 등록에 사용한 가상 파일이다.
