# 전표 확정·원장 첫 서버 묶음 제안

작성일: 2026-10-07. 상태: **P1~P8 사용자 확정 / 서버 부분 구현·검증 완료**. 확정일: 2026-10-07. 확정 근거: P1~P8·API 3개·최초 구현 파일 18개·K1~K8을 제시한 직후 사용자가 `확정`(`docs/IMPLEMENTATION_PLAN.md` 지정)으로 응답했다. 구현 중 공용 상태 타입 의존성2파일을 목적 기록 후 추가해 최종20파일이 됐다. 영향 작업 ID: F04-08·09·10, F05-01·03·07, F08-13.

사용자 요청 “다음”(`docs/IMPLEMENTATION_PLAN.md` 지정)에 따라 방금 완료한 승인 화면 다음의 최소 서버 묶음을 제시했고, 위 사용자 응답으로 전체 범위를 확정했다. 기존 P-01·02·03·04·10과 승인 정책은 그대로 재사용한다.

[문서 인덱스](../README.md) · [구현 계획](../IMPLEMENTATION_PLAN.md) · [전표와 원장](04-journals-ledger.md) · [승인과 마감](05-approval-closing.md)

## 확인한 선행 상태와 다음 순서

- 필수 결정 P-01·P-02·P-03·P-04·P-10은 실제 값과 사용자 근거가 기록되어 있다. `journal.confirm` 권한은 승인자와 회사 관리자에게 있고 본인 승인 제한도 적용한다.
- 전표 초안·증빙 연결과 승인 요청→승인/반려→초안 복귀 서버·화면·운영 검증은 완료했다. 현재 상태는 DRAFT·SUBMITTED·APPROVED·REJECTED 네 종류이며 APPROVED는 장부에 반영되지 않는다.
- F04-08·09의 원장과 기준일 조회는 장부에 포함할 전표 상태가 먼저 필요하다. 따라서 다음 묶음은 F05-01·03의 POSTED 확정과 F04-08·09·10의 읽기 전용 원장 기반을 함께 구현하는 안이다.
- 기초 잔액은 일반 전표와 다른 입력·승인·중복 방지 계약이 필요하므로 이번 묶음 다음으로 둔다. 기간 마감·마감 취소·역분개·정정, 재무제표·세무 집계, 브라우저 화면과 운영 배포도 포함하지 않는다.

영향 작업 ID: F04-08·09·10, F05-01·03·07, F08-13. 상위 F04·F05 체크는 부분 구현 근거만 기록하고 완료 처리하지 않는다.

## 확정한 P1~P8

| ID | 추천 선택값 | 동작과 영향 |
| --- | --- | --- |
| P1 | POSTED 확정과 읽기 전용 원장 서버를 한 묶음으로 구현 | APPROVED 전표를 장부에 넣는 경계와 그 결과를 읽는 분개장·계정별 원장을 같은 격리 DB 검증으로 대사한다. 화면·운영 반영은 후속이다. |
| P2 | 상태 전이는 `APPROVED → POSTED` 한 방향이며 확정 취소는 제공하지 않음 | POSTED 뒤 전표·분개·증빙 연결은 영구 읽기 전용이다. 오류 수정은 후속 역분개·정정 전표로 처리하며 상태를 APPROVED로 되돌리지 않는다. |
| P3 | 확정은 `journal.confirm` 권한과 실행 시점의 회사·소속·본인 승인 정책을 모두 적용 | 승인자·회사 관리자만 확정할 수 있다. 작성자가 확정하려면 회사의 현재 본인 승인 허용과 확정 권한이 모두 필요하다. 승인 당시 설정을 캐시해 우회하지 않는다. |
| P4 | `version + actionRequestId(UUID)`로 확정 재전송·경합을 보호 | 같은 회사·작업 ID·정규화 본문이면 기존 결과를 반환한다. 다른 본문, 오래된 버전, 승인/확정 동시 경합은 409다. 상태·확정 기록·감사를 한 트랜잭션으로 저장한다. |
| P5 | 별도 불변 `JournalPosting` 1행이 확정 제출본·처리자·서버 UTC 시각을 보존 | 전표의 회계일자·번호·작성자는 바꾸지 않는다. 전표별 확정은 최대 1회이며 posting은 수정·삭제하지 않는다. 일반 감사에는 전표/확정 ID·상태/version만 기록하고 적요·금액·증빙 원문은 복사하지 않는다. |
| P6 | 원장은 POSTED 전표의 기존 불변 `journal_lines`를 단일 원천으로 사용 | 중복 금액 행을 별도로 복사하지 않는다. 원장 조회는 posting과 분개를 결합하며 전표·분개 합계와 계정별 차변/대변/잔액을 Decimal로 대사한다. DRAFT·SUBMITTED·APPROVED·REJECTED는 제외한다. |
| P7 | 회계일자 기준과 확정 시각 기준을 분리해 조회 | 기본 조회는 현재까지 POSTED된 전표 중 회계일자 범위를 적용한다. 선택적인 `postedThrough` UTC를 주면 그 시각까지 확정된 전표만 포함해 늦게 확정된 과거 일자 전표를 구분한다. 결과에는 accountingDate와 postedAt을 모두 표시한다. |
| P8 | 원장 첫 조회는 분개장과 계정별 원장·잔액만 제공 | 회사 전체 분개장과 특정 계정의 기초 0 기준 누적 잔액을 제공한다. 기초 잔액, 총계정원장 요약/시산표, 마감, 정정, 보고서 확정본은 후속 계약으로 분리한다. 계정이 중지돼도 과거 POSTED 원장 조회는 허용한다. |

추천안은 승인 완료와 장부 반영을 명확히 분리하고, 확정 뒤 원본을 되돌리는 기능을 만들지 않으면서 현재 장부와 당시 확정 시점 조회를 모두 지원한다. 이는 프로젝트 구현 정책이며 법정 장부 요건 충족을 단정하지 않는다.

## 제안 API 3개

경로 앞에는 `/api`를 붙인다. 조회는 `journal.read`, 확정은 `journal.confirm`과 기존 Origin/CSRF·활동 선언·회사 권한 재검사를 적용한다. 응답은 `Cache-Control: no-store`를 유지한다.

| 방법 | 경로 | 내용 |
| --- | --- | --- |
| POST | `/companies/:companyId/journals/:journalId/confirm` | APPROVED → POSTED. 본문은 `version`, `actionRequestId`; 서버가 현재 승인 제출본·권한·회사 설정을 다시 확인한다. |
| GET | `/companies/:companyId/ledger/journal-book` | POSTED 분개장. 회계연도·회계일자 범위·선택적 postedThrough·계정·전표 번호/적요 검색·20 기본/100 최대 cursor 조회. |
| GET | `/companies/:companyId/ledger/accounts/:accountId` | POSTED 계정별 원장. 같은 날짜/시각 조건과 cursor를 적용하고 차변·대변 합계 및 기초 0 기준 누적 잔액을 반환한다. |

정렬은 `accountingDate, journal number, line position, line id` 오름차순으로 고정한다. cursor에는 마지막 정렬 키와 조회 조건 지문을 포함해 다른 회사·필터 재사용을 거부한다. 금액은 기존 API 계약대로 문자열이며 잔액은 계정의 정상 잔액 방향과 별개로 차변 누계·대변 누계·차변-대변 순액을 명시한다.

## 제안 데이터·무결성 계약

- `JournalStatus`에 POSTED, `JournalWorkflowActionKind`에 CONFIRM을 추가한다. 허용 전이는 기존 네 전이에 APPROVED→POSTED만 더한다.
- `JournalPosting`은 companyId·journalId·submissionId·actionId·actorId·postedAt을 가진다. 전표·제출본·처리 작업은 모두 같은 회사 복합 FK로 묶고 journalId는 유일하다.
- 기존 workflow action이 확정의 actionRequestId·inputHash·version 전후를 보존한다. posting은 해당 CONFIRM action과 최신 승인 제출본을 가리킨다.
- SQL 제약/지연 제약 트리거가 CONFIRM 전이, 전표별 posting 1개, POSTED와 posting의 상호 존재, 확정 후 전표/분개/증빙/제출본/이력 불변을 검사한다.
- 확정 트랜잭션은 회사·소속/역할·전표를 기존 순서로 잠그고 상태와 version, 최신 승인 제출본, 현재 본인 승인 설정을 확인한다.
- 원장 조회는 쓰지 않으며 읽기 시 회사 범위와 계정 소속을 확인한다. 중지 계정은 조회 가능하지만 다른 회사 계정은 404다.
- 아직 기초 잔액이 없으므로 계정별 누적 잔액은 명시적으로 0에서 시작한다. 이를 회사의 실제 개시 잔액으로 표시하지 않는다.

## 구현 파일 20개와 목적

사용자 확정 후 아래 순서로 설명하고 구현한다. 구현 중 새 필수 파일이 확인되면 목적을 먼저 문서에 추가한다.

| 순서 | 파일 | 목적 |
| --- | --- | --- |
| 1 | `server/prisma/schema.prisma` | POSTED/CONFIRM과 불변 확정 메타데이터 모델·복합 관계 |
| 2 | `server/prisma/migrations/20261007030000_journal_posting_ledger_foundation/migration.sql` | 기존 14 migration을 보존하는 상태·posting·불변/감사 SQL |
| 3 | `server/src/journals/journal-workflow.ts` | APPROVED→POSTED 순수 전이와 확정 입력 해시 |
| 4 | `server/src/journals/journal-workflow.schemas.ts` | confirm 본문의 strict UUID/version 검증 |
| 5 | `server/src/journals/journal-workflow.service.ts` | 권한/설정 재검사, 잠금, posting·전이·감사 원자 저장과 재요청 |
| 6 | `server/src/journals/journal-workflow.controller.ts` | confirm 경로·journal.confirm 권한·no-store 응답 |
| 7 | `server/src/journals/ledger.schemas.ts` | 회계연도·날짜·UTC cutoff·검색·계정·cursor 입력 검증 |
| 8 | `server/src/journals/ledger.service.ts` | POSTED 분개장·계정별 합계/누적 잔액·회사 범위 조회 |
| 9 | `server/src/journals/ledger.controller.ts` | 원장 읽기 2경로와 안전한 응답 계약 |
| 10 | `server/src/journals/journals.module.ts` | posting/ledger 서비스·컨트롤러 등록 |
| 11 | `server/src/audit/audit.service.ts` | JOURNAL_POSTED 정적 감사 입력과 민감 본문 배제 |
| 12 | `src/lib/api.ts` | 상태 타입에 POSTED 추가. 원장 화면 API 연결은 후속 |
| 13 | `server/tests/journal-workflow-validation.test.ts` | confirm 형식·전이·재요청 해시 경계 |
| 14 | `server/tests/journal-workflow-foundation.test.ts` | 확정 권한·현재 설정·경합·posting/감사 원자성·불변성 |
| 15 | `server/tests/ledger-validation.test.ts` | 날짜·UTC·검색·cursor·계정 입력 경계 |
| 16 | `server/tests/ledger-foundation.test.ts` | 격리 DB 분개장·계정 원장·잔액·cutoff·회사/상태 분리 대사 |
| 17 | `server/tests/api-contract.test.ts` | 새 3경로의 권한·CSRF/Origin·no-store·상태 코드 계약 |
| 18 | `server/tests/database-foundation.test.ts` | 15번째 migration과 새 posting 테이블·제약 회귀 |
| 19 | `src/components/journals/JournalDetail.tsx` | 새 POSTED 상태를 기존 전표 상세에서 안전하게 표시 |
| 20 | `src/components/journals/ApprovalDetail.tsx` | POSTED 상세 응답의 상태 이름을 누락 없이 표시 |

구현 중 `JournalStatus` 공용 타입에 POSTED를 추가하자 두 기존 상세 컴포넌트의 상태 이름 표가 전체 상태를 다뤄야 한다는 타입 의존성을 확인했다. 새 버튼이나 화면 범위를 넓히지 않고 컴파일 안전성을 유지하기 위해 19·20번 파일을 필수 인접 파일로 추가했다.

브라우저 화면 파일, 운영 배포 스크립트, 기초 잔액·마감·정정 모델은 이 목록에 포함하지 않는다. 상세 주석은 입력→권한→잠금→재요청→확정 저장→감사→원장 조회 흐름과 POSTED 포함 기준을 설명한다.

## 구현 후 완료 검증 K1~K8

| ID | 객관적 완료 조건 | 예정 근거 |
| --- | --- | --- |
| K1 | APPROVED→POSTED만 성공하고 DRAFT/SUBMITTED/REJECTED/POSTED 재확정을 거부 | 상태별 HTTP 시험·DB 상태/version/action/posting 행 대조 |
| K2 | 역할5·겸임·회사 분리·현재 본인 승인 설정·활성 소속이 journal.confirm 결과와 일치 | 권한 조합 시험·설정 변경/확정 경합 결과 |
| K3 | 같은 actionRequestId 재전송과 동시 confirm에서 posting·전이·감사가 정확히 1개 | 병렬 요청 결과, 고유 제약과 행/감사 건수 |
| K4 | 감사/참조/SQL 제약 실패에서 상태·posting·전이의 부분 저장이 없음 | 강제 실패 시험과 트랜잭션 전후 지문 |
| K5 | POSTED 전표만 분개장/계정 원장에 포함되고 금액·순서·cursor·회사 경계가 정확 | API 결과와 journal_lines SQL 원본의 정확 비교 |
| K6 | accountingDate와 postedThrough 경계, 늦은 확정, 연도/날짜 끝점과 중지 계정 조회가 정확 | 경계 사례별 결과 ID·합계·잔액 비교 |
| K7 | 전표·분개·계정별 차변/대변/순액이 일치하고 API 금액은 문자열 | Decimal 원본 대사와 응답 타입 시험 |
| K8 | 전체 서버/DOM/Appearance·schema/타입/build/lint 통과, 기존 정책·139체크·14 migration·과거 증빙·기본 DB 행 보존 | 명령/시험 수·종료 코드, SHA-256·행 지문·격리 DB 기록 |

첫 검증에서 FAIL+UNVERIFIED가 2개를 넘으면 수리를 멈추고 가장 앞선 실패 계층을 보고한다. 2개 이하이면 근본 원인을 수정한 뒤 K1~K8 전체를 다시 실행한다. 모든 필수 조건 PASS 전에는 완료로 표시하지 않는다. Hindsight는 기존 30분 예약 실행에 맡긴다.

## 사용자 확정 기록

2026-10-07 사용자가 P1~P8 추천안 전체와 위 API 3개·최초 구현 파일 18개·K1~K8 범위에 `확정`으로 응답했다. 구현 중 공용 상태 타입에 직접 의존하는 상세 표시2파일을 위 목록 19·20번에 먼저 기록하고 함께 검증했다. 이 기록은 해당 서버 묶음의 구현 승인 근거이며, 후속 기초 잔액·마감·정정·화면·운영 배포까지 승인한 뜻은 아니다.

## 구현 흐름과 실패 경계

확정 요청은 컨트롤러의 `journal.confirm` 검사 뒤 서비스가 현재 세션·활성 소속·역할·본인 승인 설정을 다시 읽고 사용자, 회사, 소속/역할, 전표 순서로 잠근다. 전표가 APPROVED이고 요청 version이 현재 값일 때만 상태/version을 바꾸고 CONFIRM 이력, `JournalPosting`, `JOURNAL_POSTED` 감사를 같은 트랜잭션에 저장한다. 같은 회사의 같은 `actionRequestId`와 같은 본문은 기존 결과를 돌려주고, 다른 본문·오래된 version·경합 패자는 409다. 감사나 posting 제약이 실패하면 네 변경이 모두 롤백된다.

원장 조회는 `JournalPosting`이 있고 상태가 POSTED인 전표의 기존 불변 `journal_lines`만 읽는다. 회계일자와 선택적인 확정시각 cutoff를 각각 적용하고 `accountingDate, journalNumber, position, lineId`로 정렬한다. cursor에는 마지막 키와 회사·계정·필터 지문을 함께 넣어 다른 조회 조건에서 재사용하면 400으로 거부한다. 금액은 DB Decimal 합계를 공통 금액 직렬화기로 문자열로 반환하며, 계정별 첫 버전의 기초 잔액은 확정한 범위대로 명시적 `0`이다.

현재 승인 화면은 새 확정 버튼을 아직 노출하지 않는다. 서버 상세 이력은 CONFIRM과 POSTED를 안전하게 표시하지만 `allowedActions`에서는 후속 화면 묶음 전까지 CONFIRM을 제외한다. 기초 잔액·마감·정정·원장 전용 화면·운영 마이그레이션 적용은 이번 완료에 포함하지 않는다.

## 실제 실행 검증 완료 — 2026-10-07

[구조화 결과](../../.artifacts/implementation-f05-posting-ledger/results.json)에 K1~K8을 기록했다. 서버 전체32파일·781시험, DOM4파일·176시험, Appearance16시험이 통과했고 서버/프런트 build, lint, Prisma schema validate/format, DB·테스트 타입 검사가 모두 종료0이다. 15개 migration과 `journal_postings` 포함30테이블을 격리 DB에 적용했으며 각 통합 시험이 기본 DB의 전체 테이블 count/digest를 전후 대조하고 자신이 만든 임시 DB만 제거했다. 기존 계획 체크139행은 이전 baseline과 정확히 같고 직전 완료 결과 파일 SHA-256은 `E7C8134CB39F2705EA4D774B8F6A709D40F00F3ED48691AE625458447698A87A`로 보존됐다.

첫 격리 시험의 비통과2건은 `pg_sleep()`의 void 역직렬화로 준비가 중단된 한 원인이었고 비동기 타이머로 바꾼 뒤 같은3파일·35시험 전체를 재실행해 통과했다. 정적 검사 첫 묶음의 비통과2건은 Prisma 정렬과 체크행 정규식 누락이었고 두 원인을 수정한 뒤 schema·DB 타입·테스트 타입·문서 링크·139행 묶음을 전부 다시 실행해 통과했다. Hindsight는 지침대로 즉시 수동 동기화하지 않고 기존30분 예약에 맡겼다.
