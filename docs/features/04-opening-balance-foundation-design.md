# 기초 잔액 첫 서버 묶음 제안

상태: 사용자 확정 범위의 첫 서버 묶음 구현·검증 완료. 기초 잔액 화면·운영 배포·마감·정정·재무제표·세무 집계와 상위 업무 체크는 후속이다.

[문서 인덱스](../README.md) · [구현 계획](../IMPLEMENTATION_PLAN.md) · [전표와 원장](04-journals-ledger.md) · [승인과 마감](05-approval-closing.md) · [직전 POSTED·원장 서버 묶음](05-journal-posting-ledger-foundation-design.md)

## 선행 상태와 이번 작업 위치

- P-01·P-02·P-03·P-04·P-10의 실제 정책값과 사용자 확정 근거가 기록되어 있다.
- 일반 전표의 초안 작성, 승인 요청·승인·반려, `APPROVED → POSTED` 확정과 POSTED 전용 분개장·계정별 원장 서버 기반은 구현·검증했다.
- [직전 확정 범위 P4](05-journal-posting-ledger-foundation-design.md#확정값-p1p8)는 기초 잔액을 다음 서버 묶음으로 분리했다.
- 이번 묶음은 F04-02·08·09·10, F05-01·03, F08-13의 기초 잔액 서버 부분이다. 기초 잔액 화면, 운영 DB 반영, 기간 마감·정정·재무제표·세무 집계는 포함하지 않는다.

## 확정이 필요한 추천 선택 O1~O8

| ID | 추천 선택 | 영향과 이유 |
| --- | --- | --- |
| O1 | 기존 `JournalEntry`에 `STANDARD`·`OPENING` 종류를 추가하고 기존 전표 승인·확정 흐름을 재사용 | 별도 승인 엔진을 복제하지 않는다. 일반 전표 API는 항상 `STANDARD`, 전용 기초 잔액 API만 `OPENING`을 만든다. |
| O2 | 회사·회계연도마다 기초 잔액 전표는 하나만 허용하고 삭제·두 번째 생성은 제공하지 않음 | DRAFT 또는 REJECTED 상태에서는 같은 전표를 수정·재요청한다. POSTED 뒤 오류는 후속 정정 전표로 처리한다. 일반 전표 번호 순서를 재사용하고 종류로 구분한다. |
| O3 | 회계일자는 해당 회계연도 시작일로 서버가 강제하고 통화는 KRW, 거래처는 없음 | 요청 본문이 시작일·통화·거래처를 임의 지정하지 못하게 해 연초 잔액과 일반 거래를 구분한다. |
| O4 | 비영(非零) 잔액은 2~100개 분개·차변=대변·양의 합계, 0원 확인은 0개 분개·합계 0으로 저장 | 차액 자동 보정과 가짜 1원 분개를 만들지 않는다. 기존 일반 전표의 2개 이상·양수 제약은 그대로 유지한다. |
| O5 | 비영 잔액은 READY 근거 증빙을 1개 이상 필수 연결하고, 0원 확인은 증빙 없이 허용 | 확정한 ‘근거 시산표 연결’과 ‘0도 명시 확인’을 함께 만족한다. 지원 형식은 현재 증빙 정책의 PDF/JPEG/PNG를 따른다. |
| O6 | 이전 내부 회계연도가 있으면 같은 회사의 가장 가까운 이전 연도를 `sourceFiscalYearId`로 연결하고, 없으면 null 허용 | 첫 도입 회사의 외부 이관을 막지 않는다. 기간 마감이 아직 없으므로 이번 묶음은 출처 관계와 근거 증빙을 보존하되 전기 확정 잔액과의 자동 일치 판정은 하지 않는다. |
| O7 | `DRAFT → SUBMITTED → APPROVED → POSTED`와 journal.draft/request/approve/confirm, 현재 본인 승인 설정을 그대로 적용 | 기초 잔액만의 우회 확정 권한을 만들지 않는다. 제출본에는 종류·출처·0원 여부·분개·증빙을 함께 동결한다. |
| O8 | 계정별 원장은 회계연도를 필수로 받아 POSTED 기초 잔액을 `openingBalance`로 분리하고 당기 일반 전표만 항목으로 반환 | `from`이 연도 시작일보다 늦으면 기초 잔액과 그 전날까지의 당기 POSTED 움직임을 이월 잔액에 포함한다. `postedThrough`도 기초와 당기 항목에 함께 적용하고, 기초 0 확정과 미확정을 별도 상태로 구분한다. |

O6의 제한 때문에 이번 단계는 ‘출처를 보존한 균형 기초 잔액’까지 검증한다. 전기 마감 잔액과의 자동 대사 성공을 주장하거나 응답에 `reconciled=true` 같은 값을 만들지 않는다. 그 연결은 F05 마감과 F04-10 대사 묶음에서 검증한다.

## 제안 API와 응답 계약

| 메서드 | 경로 | 계약 |
| --- | --- | --- |
| POST | `/companies/:companyId/fiscal-years/:fiscalYearId/opening-balance` | `creationRequestId`, `sourceFiscalYearId`, `evidenceIds`, `lines`로 유일한 DRAFT 기초 잔액 생성. 같은 요청/본문은 기존 결과, 다른 본문·이미 존재하면 409 |
| GET | `/companies/:companyId/fiscal-years/:fiscalYearId/opening-balance` | 종류·상태·version·출처·증빙·분개·0원 여부 조회. 없거나 다른 회사이면 404 |
| PATCH | `/companies/:companyId/fiscal-years/:fiscalYearId/opening-balance` | DRAFT 상태에서 `version`, 출처·증빙·분개 전체 교체. REJECTED는 기존 return-to-draft 후 수정 |

제출·승인·반려·초안 복귀·확정은 기존 `/companies/:companyId/journals/:journalId/...` 경로를 재사용한다. 전용 API는 상태를 우회 변경하지 않는다. 계정별 원장 경로는 기존 경로를 유지하되 `fiscalYearId`를 필수로 하고 `openingBalance`, `openingBalanceStatus`(`MISSING`·`CONFIRMED_ZERO`·`POSTED`), `openingBalanceJournalId`, 당기 합계와 `closingBalance`를 반환한다.

## 데이터·트랜잭션·불변 규칙

- `JournalKind` 기본값은 `STANDARD`다. 기존 행과 일반 전표 API의 의미를 바꾸지 않는다.
- `OPENING`은 회계연도 시작일·회사·출처 연도·증빙·계정 소속을 잠금 아래 다시 확인하고 생성·분개·증빙·감사를 한 트랜잭션에 저장한다.
- 같은 회사·회계연도의 `OPENING`은 부분 고유 인덱스로 하나만 허용한다. `creationRequestId`와 정규화 입력 해시는 기존 중복 저장 방지 원칙을 따른다.
- SQL 지연 제약은 STANDARD의 기존 2~100개·양수 균형을 보존하고 OPENING에만 0개/0원 또는 2~100개/양수 균형을 허용한다.
- 비영 OPENING은 READY 증빙 1개 이상, 0원 OPENING은 분개 0개·합계 0·증빙 0개 이상을 허용한다. 모든 계정은 활성이고 분류·정상 잔액 방향이 확정되어야 한다.
- 제출본 해시와 불변 보호에 `kind`, `sourceFiscalYearId`를 포함한다. POSTED 뒤 헤더·분개·증빙·제출본·이력·posting은 기존 불변 계약을 적용한다.
- 일반 감사에는 원문 적요·금액·증빙 내용·입력 해시를 복사하지 않고 기초 잔액 식별자, 고정 필드명, 버전, 분개/증빙 개수만 기록한다.
- 원장 합계는 Decimal 원본을 문자열로 직렬화한다. OPENING 분개를 당기 거래 합계에 중복 포함하지 않는다.

## 사용자 확정 후 구현할 파일과 목적

구현 중 필수 인접 파일이 새로 확인되면 코드보다 먼저 이 목록에 목적을 추가한다. Prisma 생성 파일은 `prisma generate`의 기계 생성 결과로만 갱신하고 직접 편집하지 않는다.

| 순서 | 파일 | 목적 |
| --- | --- | --- |
| 1 | `server/prisma/schema.prisma` | JournalKind·기초 출처 관계와 기존 전표 모델의 구분 |
| 2 | `server/prisma/migrations/20261007040000_opening_balance_foundation/migration.sql` | 기존 15 migration을 보존하는 종류·유일성·조건부 균형·출처·감사 SQL |
| 3 | `server/src/journals/opening-balance.ts` | 기초 잔액 전용 정규화·0원/비영 분기·재요청 해시 |
| 4 | `server/src/journals/opening-balance.schemas.ts` | 전용 경로의 strict UUID/version/분개·증빙 입력 검증 |
| 5 | `server/src/journals/opening-balance.service.ts` | 회사/연도/출처/계정/증빙 잠금, 생성·수정·조회·감사 원자 처리 |
| 6 | `server/src/journals/opening-balance.controller.ts` | 전용 3경로와 journal.read/draft 권한·no-store 응답 |
| 7 | `server/src/journals/journals.module.ts` | 새 컨트롤러·서비스 등록 |
| 8 | `server/src/journals/journal-workflow.service.ts` | OPENING 제출본의 종류·출처·0원 규칙 재검사와 기존 전이 재사용 |
| 9 | `server/src/journals/journals.service.ts` | 일반 전표를 STANDARD로 고정하고 조회 응답에서 종류 구분 |
| 10 | `server/src/journals/ledger.schemas.ts` | 계정 원장의 회계연도 필수·날짜/cutoff 경계 검증 |
| 11 | `server/src/journals/ledger.service.ts` | 기초·이월·당기 항목·마감 잔액 분리 대사 |
| 12 | `server/src/audit/audit.service.ts` | 기초 생성·수정의 정적 감사 계약과 민감 본문 배제 |
| 13 | `server/tests/opening-balance-validation.test.ts` | 0원/비영·출처·증빙·버전·엄격 입력 경계 |
| 14 | `server/tests/opening-balance-foundation.test.ts` | 격리 DB 생성·수정·중복·권한·승인·확정·불변·원자성 |
| 15 | `server/tests/journal-workflow-foundation.test.ts` | OPENING 제출본과 기존 본인 승인/확정 흐름 회귀 |
| 16 | `server/tests/ledger-validation.test.ts` | 필수 회계연도·기간·cutoff·cursor 입력 회귀 |
| 17 | `server/tests/ledger-foundation.test.ts` | 기초/이월/당기/마감 잔액과 STANDARD·OPENING 중복 배제 대사 |
| 18 | `server/tests/api-contract.test.ts` | 새 3경로와 기존 원장 경로의 권한·CSRF/Origin·no-store 계약 |
| 19 | `server/tests/database-foundation.test.ts` | 16번째 migration·조건부 제약·기존 행/전표 회귀 |

이번 파일 목록에는 React 화면, 운영 배포 스크립트, 마감·정정·재무제표·세무 집계가 없다. 구현 상세 주석은 입력→회사/연도/출처 잠금→정규화→저장/감사→기존 승인→POSTED→원장 조회 흐름과 0원 분기를 설명한다.

## 구현 후 완료 검증 K1~K8

| ID | 객관적 완료 조건 | 예정 근거 |
| --- | --- | --- |
| K1 | STANDARD 기존 제약을 보존하고 OPENING만 0개/0원 또는 2~100개/양수 균형을 허용 | schema 검사, 직접 SQL 거부/허용 사례와 DB 행 대조 |
| K2 | 회사·회계연도당 하나, 시작일·KRW·거래처 없음, 가장 가까운 이전 내부 연도 연결과 회사 경계가 정확 | API/SQL 결과, 고유 제약·외래키·경계 상태 코드 |
| K3 | 비영 잔액의 READY 증빙 필수와 0원 명시 확인이 동작하고 차액 자동 보정·부분 저장이 없음 | 입력 조합별 HTTP 결과와 트랜잭션 전후 행 지문 |
| K4 | journal.draft/request/approve/confirm, 활성 소속·본인 승인 설정·다섯 역할 합산이 기존 전표와 동일 | 역할/상태/설정 조합 시험과 감사·이력 대조 |
| K5 | 같은 creation/action 요청 재전송과 동시 생성·수정·확정에서 기초 전표·posting·감사가 정확히 하나 | 병렬 요청, 입력 해시·version·고유 제약과 건수 |
| K6 | POSTED 뒤 헤더·출처·분개·증빙·제출본·이력·posting이 불변이고 DRAFT/REJECTED/APPROVED는 원장에 미포함 | 직접 SQL/API 변경 거부와 원장 결과 비교 |
| K7 | 기초 잔액, 늦은 `from`의 이월, 당기 합계·running/closing balance와 `postedThrough`가 원본 Decimal과 일치 | 회계연도/날짜/cutoff별 API와 SQL exact comparison |
| K8 | 전체 서버/DOM/Appearance·schema/타입/build/lint 통과, 기존 정책·139체크·15 migration·과거 자료·기본 DB 행 보존 | 명령/시험 수·종료 코드, SHA-256·행 지문·격리 DB 기록 |

첫 검증에서 FAIL+UNVERIFIED가 2개를 넘으면 수리를 멈추고 가장 앞선 실패 계층을 보고한다. 2개 이하이면 근본 원인을 수정한 뒤 K1~K8 전체를 다시 실행한다. 모든 필수 조건 PASS 전에는 완료로 표시하지 않는다. Hindsight는 기존 30분 예약 실행에 맡긴다.

## 사용자 확정 기록

2026-10-07 사용자가 이 제안 직후 `확정`(`IMPLEMENTATION_PLAN.md` 지정)으로 응답해 O1~O8·API 3개·구현 파일 19개·K1~K8 전체를 선택했다. 영향 작업 ID는 F04-02·08·09·10, F05-01·03, F08-13의 기초 잔액 서버 부분이다. 이 근거로 위 파일 순서와 검증 묶음의 구현을 시작하며 화면·운영 배포·마감·정정·재무제표·세무 집계는 승인 범위에 포함하지 않는다.

## 전체 재검증 완료 — 2026-10-07

첫 통합 검증은 91개 중 테스트 계약 3건이 실패해 저장소 게이트에 따라 수리를 중단하고 가장 앞선 테스트 기대값 계층을 보고했다. 실제 migration 인덱스명, 기존 workflow 응답 필드, `EXTERNAL_TAX`의 확정 권한표와 기대값을 맞춘 뒤 같은 7파일·91개 전체를 다시 실행해 모두 통과했다. 서버 전체의 기본 병렬 실행에서는 동시 확정 1건이 다른 격리 DB 파일과 간섭해 401을 반환했고, 각 파일이 `DATABASE_URL`을 바꾸는 통합 테스트 특성에 맞춰 `--maxWorkers=1`로 전체를 재실행해 34파일·790개를 통과했다.

| ID | 결과 | 객관적 근거 |
| --- | --- | --- |
| K1 | PASS | `prisma format`·`prisma validate` 종료0, migration 직접 제약 시험을 포함한 `database-foundation.test.ts` 통과 |
| K2 | PASS | `opening-balance-foundation.test.ts`의 회사·연도·출처·단일 전표·시작일 경계 통과 |
| K3 | PASS | 0원/비영·READY 증빙·원자 rollback 입력 조합과 `opening-balance-validation.test.ts` 통과 |
| K4 | PASS | 기존 역할·본인 승인·상태 전이와 OPENING workflow를 포함한 핵심 7파일 91/91 통과 |
| K5 | PASS | 동시 생성·수정·확정, request ID 재전송과 단일 posting/감사 건수 시험 통과 |
| K6 | PASS | POSTED 헤더·출처·분개·증빙·제출본·이력·posting 직접 변경 거부와 비확정 원장 제외 시험 통과 |
| K7 | PASS | 회계연도·`from`·`postedThrough`별 기초/이월/당기/running/closing Decimal 대사 시험 통과 |
| K8 | PASS | 서버 34파일 790/790, DOM 4파일 176/176, Appearance 16/16, schema·DB/테스트 타입·웹/API build·lint 종료0, migration16·계획 체크139행 보존 |

전체 Playwright 278개는 추가 범위 점검에서 274개 통과·4개 실패했다. 실패는 이번 19파일 밖의 기존 `EvidencePreview`가 React StrictMode에서 원본 effect를 두 번 실행하는 3건과 403 뒤 복수 `role=status`를 단일 요소로 가정한 선택자 1건이다. 첫 실행 비통과가 4건이므로 게이트에 따라 해당 증상을 이번 묶음에서 수정하지 않았고 별도 증빙 미리보기 작업으로 남겼다. 기초 잔액 필수 K1~K8에는 증빙 미리보기 전체 E2E가 포함되지 않는다.
