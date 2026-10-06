# 전표 초안·증빙 연결 첫 서버 묶음 확정 설계

[문서 인덱스](../README.md) · [구현 계획](../IMPLEMENTATION_PLAN.md) · [전표와 원장](04-journals-ledger.md)

작성일/확정일: 2026-10-07. 상태: **J1~J8·API5개·구현 파일15개 확정 · 수리 후 K1~K8 전체 PASS · 초안 서버 부분 완료**. 구체적인 설계안/파일/검증을 제시한 직후 사용자 “확정”(api.ts 지정)으로 J1~J8 전체 추천안을 선택했다. 영향 ID는 F04-03~07·10 초안 부분, F03-04 증빙 연결 부분, F08-13 권한·감사다. 실제 선택값은 아래 J1~J8이며 최초 실패와 최종 재검증 기록을 구분한다.

작업 ID: F04-03~07·10의 초안 부분, F03-04의 증빙 연결 부분, F08-13의 권한·감사. P-01·02·03·04·10의 기존 확정값을 재사용한다. 승인·확정·마감·정정·원장·기초 잔액·표준 계정 템플릿·보고서 매핑·세율 계산은 이 묶음의 구현 범위에 포함하지 않는다. 해당 기능을 완성한 상태로 표시하지 않는다.

수리 재개 승인(2026-10-07): 첫 검증 중단 보고 뒤 사용자 “수정해”(schema.prisma 지정)로 같은 J1~J8 서버 범위의 수리를 지시했다. 수정 대상은 `server/tests/journal-draft-foundation.test.ts`(완료 증빙을 유지하고 시험마다 새 회사/참조 구성), `server/tests/database-foundation.test.ts`(실제 migration 목록과 추가4테이블 대조), `.artifacts/implementation-f04-journal-draft/verify-completion.mjs`(기존 시험 의존성 사전 확인)이다. 중지된 기존 `atms-dev-mailpit-1`을 기존 설정 그대로 재기동해 메일 회귀를 수행했다. 새 개발 서비스/포트 번호/환경 설정은 추가하지 않았다. 기본 DB/홈서버 SQL 적용은 기존 범위대로0이며 K1~K8 전체를 재실행해 통과했다. 최초 실패 결과와 원본 보호 트리거를 보존했다. 최종 상태와 실행 근거는 문서 끝의 재검증 기록을 따른다.

## 선행 근거와 진행 순서

아래 모델 부재와 제안 설명은 구현 착수 전 근거다. 사용자 확정 뒤 승인한4모델/15파일을 작성했으며 실행 검증 완료와 구분한다. 기존 계정·정책·번호/분개 계약을 바꾸는 추가 선택은 하지 않았다.

- [계정 서버 설계의 다음 순서](04-accounts-foundation-design.md#다음-작업과-선행-근거)는 계정 서버 → 계정 화면 → 전표 초안·증빙 연결 → 승인·원장이다. [계정 화면 검증](04-accounts-browser-design.md#실제-계정-브라우저-검증-완료--2026-10-07)은 K1~K8 PASS이며 가상 계정2개를 홈서버에서 등록·수정·중지하고 보존했다.
- [현재 스키마](../../server/prisma/schema.prisma)에 회사·회계연도·계정·거래처·완료 증빙은 있지만 전표/분개 모델은 없다. AccountTemplate/Item은 개발 예시를 보관하는 기반이며 실제 표준 목록 승인으로 해석하지 않는다. 따라서 수동 등록한 사용중·분류 완료 계정으로 초안 기능을 검증할 수 있다.
- [현재 역할표](../../server/src/auth/access-policy.ts)는 journal.read를 다섯 역할에, journal.draft를 회사 관리자·회계 담당자·외부 세무사에 이미 허용한다. 조회 전용·승인자 단독에는 초안 작성 권한이 없다. 겸임은 기존 합산 규칙을 따른다.
- [공통 금액 구현](../../server/src/common/money.ts)과 [원 단위 입력 스키마](../../server/src/common/money.schema.ts)를 재사용한다. Number로 금액을 합산하지 않는다.
- 이번 초안 기능은 세금 계산이나 확정 보고서 산출을 수행하지 않는다. 규칙 버전·매핑의 확정 시점 기록과 과거 확정본 재현은 승인/보고서 설계에서 연결한다. 기존 F13 기반을 제거하거나 승인된 규칙을 추정하지 않는다.

순서: J1~J8 확정 → 선택값·사용자 근거·날짜·영향 ID 기록 → 아래 서버15파일 구현 → K1~K8 검증 → 초안 화면·기존 홈서버 반영 범위 제시. 이 서버 묶음은 새 개발 포트를 열거나 홈서버에 배포하지 않는다. 서버 시험은 기존 Docker와 격리된 테스트 DB를 사용한다. 사용자 확인 뒤 최초 구현 파일은 server/prisma/schema.prisma이며 api.ts 연결은 다음 화면 묶음에서 제시한다.

## 확인할 선택값 8개

아래 J1~J8은 2026-10-07 사용자 “확정”으로 선택한 값이다. 직전 추천안과 같은 값을 채택했으며 코드/DB 구현과 검증 완료는 별도다.

| ID | 추천 선택값 | 동작과 영향 |
| --- | --- | --- |
| J1 | DRAFT(초안) 상태의 목록·상세·등록·전체 내용 수정과 증빙에서 연결된 초안 조회 API5개 | 원 단위로 균형이 맞는 초안만 저장. 초안은 본 장부/재무제표/세무 집계에 포함하지 않는다. 승인 요청·삭제·취소·확정은 후속. 문서 제목·화면·응답에서 “확정 전표”로 표시하지 않는다. |
| J2 | 사용자가 fiscalYearId·accountingDate를 명시한다. 번호는 회사/회계연도별 서버 연속 번호, 형식 YYYYMMDD-NNNNNN(예: 20260101-000001) | YYYYMMDD는 선택한 회계연도 시작일이며 단기 회계연도가 같은 해에 여러 개 있어도 충돌하지 않는다. 000001~999999, 초안 등록 트랜잭션 안에서 발급·실패 시 rollback. 회계연도·번호는 등록 후 불변, 회계일자는 해당 기간 내에서 수정. 다른 연도로 이동은409/후속. 번호를 삭제·재사용하지 않는다. 회계일자는 DATE, 등록/수정 시각은 서버 UTC. |
| J3 | 적요 trim 1~500 코드 포인트, 분개2~100행. 행별 accountId·debit·credit·선택 memo(최대500자) | debit/credit은 원 단위 10진수 문자열, 각각0 이상·한쪽만 양수/반대쪽0. 공통 parseWon/Decimal/저장 범위 검사 재사용. 같은 계정의 여러 행은 허용하고 입력 순서를1~100으로 저장. 합계가 양수이며 차변=대변일 때만 저장. 음수·소수·지수/쉼표·숫자형·범위 초과·0/0·양쪽 양수·자동 차액 보정은 거부. 단가·수량·부가세 자동 계산은 후속. |
| J4 | 전표 전체의 선택 거래처1개와 완료 증빙0~20개를 명시 연결. 중복 증빙 ID는400, 한 증빙의 여러 초안 연결은 허용 | 모든 ID는 같은 회사. 새 저장·수정 때 계정은 사용중/분류·방향 설정, 거래처는 사용중, 증빙은 Evidence 행과 READY 업로드 존재 확인. 입력 이름/번호로 연결을 추정하거나 증빙 거래처·일자를 자동 복사하지 않는다. 여러 증빙의 거래처가 다른 것도 허용하되 전표 전체 거래처를 상세에 별도로 표시한다. 연결이 증빙 금액 전부를 사용했다는 뜻은 아니다. 원본 파일·R2 키·파일 해시는 변경하지 않는다. |
| J5 | 기존 journal.read/journal.draft와 현재 회사·활성 소속·Origin/CSRF 계약을 적용. 초안 작성자는 서버 세션에서 결정하고 동일 회사의 초안 작성 권한자가 수정 가능 | 작성자 전용 제한을 새로 만들지 않는다. 사용자/세션→회사→소속/역할→전표/번호/참조 잠금 순서를 지키고 트랜잭션 안에서 권한·상태 재확인. 다른 회사 참조/없는 ID는 같은404, 잘못된 기간/형식은400, 권한 상실403. 읽기는 활동 만료를 연장하지 않고 쓰기는 기존 활동 선언을 사용한다. 별도 비밀번호 재확인은 요구하지 않는다. |
| J6 | 생성은 회사+creationRequestId(UUID)+정규화 전체 본문 해시. 수정은 version과 전체 내용 교체 | 동일 ID/최초 내용은 같은 전표 ID의 현재 view 반환, 다른 내용409. 최신 version 불일치409, 번호/작성자/회사/상태 입력 불가. 같은 내용 수정은 no-op으로 version/감사 유지. 성공한 변경만 version+1. 분개/증빙은 전표와 한 트랜잭션으로 교체하며 분개 행 ID의 이전 버전을 외부 참조로 유지하지 않는다. 자동 재시도·자동 덮어쓰기 없음. |
| J7 | 전표·분개·증빙 연결·번호 발급·원자 감사의 단일 트랜잭션. DB 복합 FK·CHECK와 지연 제약 트리거로 최종 분개 균형을 검증 | JournalEntry/JournalLine/JournalEvidence/JournalNumberSequence4모델을 추가한다. 회사+회계연도/계정/거래처/증빙/전표 복합 FK와 RESTRICT, 회사별 번호·요청 유일성, version 양수·정수 금액·단일 차대 방향·행 순서 제약. 지연 제약 트리거는 커밋 시2~100행/실제 합계/헤더 합계 일치를 검사하여 전체 행 교체 중간 상태와 구분. 입력 소수 초과는 DB 변환 전에 거부. 감사는 전표 ID·정적 변경 필드명·version·상태·행/연결 건수만 기록하고 적요·금액·생성 해시·파일 키를 넣지 않는다. |
| J8 | 먼저 서버 API/격리 DB 회귀 검증을 완료하고 다음 묶음에서 실제 초안 화면·홈서버 반영을 제시 | 기존23테이블/12마이그레이션·계정2개·정책5개·체크139행을 보존하고 추가 SQL만 작성. 로컬 기본 DB/홈서버에는 이번에 적용하지 않는다. 새 포트·환경값·비밀·R2/SMTP/터널 설정 변경 없음. 표준 템플릿·기초 잔액·승인/원장은 각각 필요한 결정·검증 뒤 진행. |

## HTTP 계약 제안

공통 `/api/companies/:companyId/journals`. 목록은 q(번호/적요, 최대100자), fiscalYearId?, from?/to?(YYYY-MM-DD, 역전400), UUID cursor?, limit 기본20/최대100. UUID 오름차순·회사/필터 밖 cursor400, `{items,nextCursor}`. 상태는 이 묶음에서 DRAFT만 제공한다. reverse 목록에도 같은 페이지 계약을 적용하되 q/기간/fiscalYearId 필터는 받지 않는다.

| ID | 요청 | 입력·출력 |
| --- | --- | --- |
| API-1 | GET 기본 경로 | 회사별 초안 요약 목록. 요약은 id/number/fiscalYearId/accountingDate/memo/currency/status/version/debitTotal/creditTotal/lineCount/evidenceCount/createdAt/updatedAt. 작성자 개인 이메일을 노출하지 않는다. |
| API-2 | GET /:journalId | 위 요약+createdById+counterpartyId+분개 `{id,position,accountId,debit,credit,memo}`+evidenceIds. 참조가 이후 중지돼도 과거 초안 조회를 숨기지 않는다. 새 수정의 자격 검사와 구분한다. |
| API-3 | POST 기본 경로 | `{creationRequestId,fiscalYearId,accountingDate,memo,counterpartyId:null 또는 UUID,evidenceIds:UUID[],lines:[...]}` → HTTP200 상세 view. 모든 필드를 명시하여 생략/기본값으로 업무 연결을 추정하지 않는다. |
| API-4 | PATCH /:journalId | `{version,accountingDate,memo,counterpartyId,evidenceIds,lines}` 전체 본문 → HTTP200 상세 view. 회계연도·번호·작성자는 불변. 최신 동일 내용은 no-op. |
| API-5 | GET /api/companies/:companyId/evidence/:evidenceId/journals | journal.read+evidence.read, 같은 회사의 존재하는 증빙에 연결된 초안 요약 목록. 별도 JournalsEvidenceController에서 처리하여 현재 증빙 파일/서비스 동작을 바꾸지 않는다. |

금액 view는 모두 원 단위 문자열, currency는 KRW, status는 DRAFT다. creationRequestId/입력 해시/서버 내부 키는 응답에 넣지 않는다. 미지 키·잘못된 날짜/UUID/금액/행/빈 적요400, 미인증401, 권한403, 범위 밖/없는 참조404, 버전/재요청/사용 중지/미분류/상태 충돌409, 기존 시도 제한429와 서비스 장애503 계약을 재사용한다. 합계 불균형은400이며 입력 원문을 오류에 복사하지 않는다. GET/쓰기 모두 Cache-Control:no-store. 브라우저 요청·반응형·초안 폐기 안내는 다음 화면 설계에서 다룬다.

## 구현 파일 목록과 설명 순서

아래 구현 파일15개는 승인 후 묶어서 변경한다. 새 파일 링크는 구현 전에는 만들지 않으며 목록 자체가 실행 완료 근거는 아니다.

| 순서 | 파일 | 변경 목적 |
| --- | --- | --- |
| 1 | `server/prisma/schema.prisma` | 전표·분개·증빙 연결·번호4모델, 관계/복합 유일성. 첫 구현 파일. |
| 2 | `server/prisma/migrations/20261007010000_journal_draft_foundation/migration.sql` | 추가 테이블/복합 FK/금액 CHECK/커밋 시 균형 제약 트리거. 과거 SQL 수정 없음. |
| 3 | `server/src/journals/journal-draft.ts` | 정규화·정확한 합계·재요청 해시 입력·같은 내용 비교의 순수 함수. |
| 4 | `server/src/journals/journals.schemas.ts` | strict 입력/UUID/날짜/행/금액/조회 필터 검증과 타입. |
| 5 | `server/src/journals/journals.service.ts` | 권한/회계연도/참조 재확인·번호·version·원자 저장·조회. |
| 6 | `server/src/journals/journals.controller.ts` | 기존 guard/검증/활동/no-store와 API1~4 연결. |
| 7 | `server/src/journals/journals-evidence.controller.ts` | API5 증빙→초안 조회·회사/권한 경계. |
| 8 | `server/src/journals/journals.module.ts` | 기존 Prisma/Session/Audit와 전표 컨트롤러/서비스 연결. |
| 9 | `server/src/app.module.ts` | JournalsModule 등록. 포트/부팅 설정 변경 없음. |
| 10 | `server/src/audit/audit.service.ts` | JOURNAL_DRAFT_CREATED/JOURNAL_DRAFT_UPDATED의 정적 감사 필드. |
| 11 | `server/tests/api-contract.test.ts` | 추가 전표 경로/권한/입력/no-store/안전한 오류/활동 선언 계약. |
| 12 | `server/tests/journal-draft-validation.test.ts` | 원 단위·큰 금액·균형·날짜·정규화·입력 해시 순서 의미 시험. |
| 13 | `server/tests/journal-draft-foundation.test.ts` | 실제 격리 DB·모든 역할·재요청·경합·권한 회수·참조·감사 rollback. |
| 14 | `server/tests/database-foundation.test.ts` | 추가 모델/복합 FK/지연 균형 검사·과거 migration/기존 자료 보존. |
| 15 | `.artifacts/implementation-f04-journal-draft/verify-completion.mjs` | K1~K8 전체 집계·종료 코드·스냅샷·기존 산출물 보존. |

실행 흐름/입출력/오류/잠금/트랜잭션 목적을 해당 코드의 상세 주석으로 표시한다. 파일마다 테스트를 반복하지 않고 관련15파일 변경 후 행동·DB·타입·빌드를 묶어 검증한다. 새 의존성은 이 제안에 없다. 예시/주석과 실제 기능을 구분해 코드 줄 번호로 설명한다.

## 구현 후 객관적인 검증 조건 8개

아래 K1~K8을 첫 검증에서 실행했다. 결과와 실패 계층은 문서 끝의 실제 실행 기록에 남긴다. 설계 문서나 API 목록이 있다는 이유로 PASS 처리하지 않는다.

| ID | 검증 조건 | 승인 후 실행 증거 |
| --- | --- | --- |
| K1 | 다섯 역할의 조회/쓰기, 겸임/다른 회사/현재 회사·세션·CSRF/Origin·활동 정책 | HTTP 실제 호출의 상태/본문·현재 역할표 일치·GET 활동 불변/쓰기 연장/다른 세션 불변 |
| K2 | 회계연도 범위·DATE/서버 시각·회사/기간별 번호·불변 번호/연도·목록/상세/필터/cursor | 두 회사/같은 해 단기 기간·기간 경계·연속 번호·동시 등록·filter/cursor 행동 시험 |
| K3 | 분개2~100행·정확한 문자열 합계·양수 균형·입력/저장 범위와 직접 SQL 제약 | 정수부18자리/합계초과·소수/음수/숫자형/NaN·양쪽/0행 거부·커밋 시 실제 합계/헤더 대조·부분 저장0 |
| K4 | 계정/거래처/증빙 회사·현재 자격, 완료 증빙 연결/해제와 증빙 역조회 | 다른 회사/미분류/중지/미완료 거부·동시 중지 경합·중복 증빙400·동일 증빙 여러 초안·원본/키/기존 메타데이터 불변 |
| K5 | 동일 생성 재요청·입력 해시·같은 내용 수정 no-op·version·분개/연결 전체 교체 | 동일 요청 동일 ID·다른 내용409·두 연결 동시 저장·stale version409·현재 view·실패 시 이전 분개 보존 |
| K6 | 저장/번호/분개/연결/감사의 원자성과 권한 회수/세션 폐기 경합 | 강제 감사/DB 실패 rollback·번호 미소모·트랜잭션 중 권한/상태 재확인·정적 감사 필드·민감 내용0 |
| K7 | 승인 추가 SQL·격리 시험 DB와 기존 자료/설정/체크/과거 근거 보존 | 기본/홈서버 추가 적용0·기존23테이블/12checksum/업무 행·계정2개 보존·테스트 대상 분리·보호 파일/정책5/139행·새 개발 서비스 포트0 |
| K8 | 같은 작업 단위의 전체 회귀·타입·schema·build/lint·Appearance·문서 링크 | 서버 기존681 포함 전체 시험·프런트 기존DOM80·Appearance16·서버/프런트 build·전체 시험 타입·Prisma validate·lint 종료0, 최초 실패 기록 보존 |

첫 검증에서 FAIL+UNVERIFIED가3개 이상이면 가장 앞선 실패 계층을 보고하고 수리를 중단한다. 2개 이하이면 근본 원인 수정 후 K1~K8 전체를 다시 실행한다. 필수 비통과가 남으면 서버 묶음을 완료로 표시하지 않는다. P/F/G139행과 전체 F03/F04 체크 상태는 이 부분 구현만으로 완료 처리하지 않는다.

## 이번 제안 문서 검증

문서 작성 전 [baseline](../../.artifacts/proposal-f04-journal-draft/baseline.json)에 보호284파일·체크139행·정책5개와 직전 계정 화면 결과를 기록했다. 제안 검증 D1=선행/현재 소스/권한/금액 계약 대조, D2=보호 파일/정책/체크 보존, D3=문서5개·링크·J8개/API5개/파일15개/K8개 일치를 검사한다. [검증 스크립트](../../.artifacts/proposal-f04-journal-draft/verify.py)와 [결과](../../.artifacts/proposal-f04-journal-draft/results.json)를 참조한다. 이3조건은 제안 문서 검증이며 전표 구현·DB 적용·서버 K1~K8 시험이나 배포 완료를 뜻하지 않는다. Hindsight는 기존30분 예약 실행을 유지한다.

실행 결과(2026-10-07): D1~D3 모두 PASS, `python .artifacts/proposal-f04-journal-draft/verify.py` 종료0. 첫 검사 D3는 PowerShell에서 Python 표준입력으로 전달한 한글 문단이 손상돼 실패했다. [최초 결과](../../.artifacts/proposal-f04-journal-draft/first-results.json)를 보존하고 UTF-8 파일 방식으로 새 문단만 복구한 뒤3조건 전체를 다시 실행했다. 코드/설정284파일·정책5개·139행은 그대로이며 신규 업무 선택은 여전히 사용자 확정 대기다.

## 첫 서버 검증과 수리 중단 — 2026-10-07

작성한 코드의 실행 흐름은 다음과 같다. 이 설명은 소스 대조이며 통합 시험 통과를 뜻하지 않는다.

- `server/prisma/schema.prisma:339`부터 헤더·분개·증빙 연결·회계연도별 번호4모델을 정의한다. 기존 회사/계정/증빙을 복합 키로 참조해 회사 경계를 유지한다.
- `server/src/journals/journals.controller.ts:11`과 `journals-evidence.controller.ts:10`에서 기존 세션/회사/권한 guard와 입력 검증을 거쳐 서비스로 전달한다. `journals.module.ts:12`는 guard 이전에도 새 경로에 no-store를 설정한다.
- `server/src/journals/journals.service.ts:100`의 생성은 정규화/해시 → 트랜잭션 내 권한 재확인 → 동일 요청 조회 → 참조 검사 → 번호 발급 → 헤더/행/연결 → 감사 → 상세 응답 순서다. 번호부터 감사까지 한 트랜잭션에 포함된다.
- 같은 서비스 `:122`의 수정은 전표 잠금과 version/원래 회계연도 검사 뒤 전체 내용을 비교한다. 같으면 그대로 반환하고 변경이 있으면 헤더 ID/번호/작성자를 유지하면서 분개/연결 교체·version 증가·감사를 저장한다.
- `server/prisma/migrations/20261007010000_journal_draft_foundation/migration.sql:52`의 지연 검사와 `:79`부터3개 제약 트리거가 커밋 시 최종 행 수/순서/실제 차대 합계/헤더 합계/연결 수/회계기간을 대조한다. 직접 SQL 제약 시험은 통과했지만 HTTP 통합 경합/rollback 검증은 아래 초기화 실패로 남았다.

위 D1~D3는 승인 전 제안 문서의 과거 기록이다. 이후 사용자 “확정”을 반영하고 승인한15파일의 코드·SQL·시험을 작성했다. 실제 서버 기능의 완료 근거는 아래 K1~K8이며 첫 검증은 완료 기준을 충족하지 않았다.

실행: `node .artifacts/implementation-f04-journal-draft/verify-completion.mjs --run-local` 종료1. [당시 명령 결과](../../.artifacts/implementation-f04-journal-draft/first-run/commands.json), [최초 집계](../../.artifacts/implementation-f04-journal-draft/first-results.json), [당시 서버 보고서](../../.artifacts/implementation-f04-journal-draft/first-run/server-tests.json)를 보존했다. 서버761개 중667 PASS·72 FAIL·22 SKIP, DOM80 PASS다. 서버/프런트 build·타입·Prisma validate·lint·Appearance 명령은 종료0이며 서버 전체 시험만 종료1이다.

| 조건 | 결과 | 객관적인 실행 근거 |
| --- | --- | --- |
| K1 | FAIL | 해당16개 중9 PASS·7 FAIL; 새 통합 시험의 초기화에서 차단됨. |
| K2 | FAIL | 해당10개 중5 PASS·5 FAIL; 번호/기간 HTTP 시험의 초기화에서 차단됨. |
| K3 | FAIL | 해당30개 중28 PASS·2 FAIL; 직접 SQL 지연 제약 검사는 통과했지만 HTTP 시험2개 차단됨. |
| K4 | FAIL | 해당12개 중1 PASS·11 FAIL; 증빙/참조 통합 시험의 초기화에서 차단됨. |
| K5 | FAIL | 해당6개 중2 PASS·4 FAIL; 재요청/수정 통합 시험의 초기화에서 차단됨. |
| K6 | FAIL | 해당5개 중0 PASS·5 FAIL; 원자성/권한 경합 통합 시험의 초기화에서 차단됨. |
| K7 | PASS | 보호279파일·정책5개·체크139행·과거 산출물13개 보존. 기본 DB 행 지문 동일·소유 시험 DB 정리·추가 SQL 업그레이드 보존. 홈서버23테이블/12기존checksum/계정2개 보존, 새 전표 SQL 적용0. |
| K8 | FAIL | 서버 전체667/761 PASS·72 FAIL·22 SKIP. 다른9개 명령 종료0·DOM80 PASS·문서 링크 검사 통과. |

가장 앞선 실패 계층은 업무 HTTP 처리 이전의 **시험 환경 사전 확인과 데이터 초기화**다. `server/tests/journal-draft-foundation.test.ts:93`의 `tx.evidence.deleteMany()`가 기존 완료 증빙을 삭제하려 해 기존 증빙 migration의 `evidence_immutable` 트리거에 `P0001: Completed evidence is immutable`로 거부된다. 첫 시험 다음34개는 이 초기화 단계에서 실패해 실제 전표 API 결과를 검증하지 못했다. 원본 보호를 완화하는 것은 승인된 해법이 아니다. 수정 재개 시 격리 시험의 원본 보존과 재사용/초기화 방식부터 검토해야 한다.

기존 메일 관련 회귀37개 실패·22개 SKIP에는 `fetch failed`가 기록됐다. 두 시험의 준비 코드가 조회하는 [메일 사전 확인](../../.artifacts/implementation-f04-journal-draft/mail-preflight-readonly.json) URL `http://127.0.0.1:8025/api/v1/messages?limit=1`은 현재 `ECONNREFUSED`다. 따라서 메일 시험 의존성 누락이 원인이라는 추론을 기록하며, 시험 당시 모든 연결 실패의 동일 원인까지 확정하지는 않는다. 서비스/포트를 새로 기동하지 않았다. 별도1개 회귀 실패는 `server/tests/database-foundation.test.ts:258`의 migration 개수12 고정 기대값과 추가 migration 적용 뒤 실제13의 불일치다.

첫 검증의 FAIL7개는 [저장소 중단 규칙](../../AGENTS.md)의 2개 초과 기준에 해당한다. 결과 확인 뒤 코드·SQL·시험을 추가 수리하거나 일부 실패만 재실행하지 않았다. 문서 상태와 실패 근거만 기록했다. 통합 시험이 막힌 권한·번호·연결·재요청·경합 동작은 검증 미완료이며 초안 화면/홈서버 반영 단계로 진행하지 않는다. P/F/G139행과 기존 완료 근거를 유지한다. Hindsight는 기존30분 예약 실행을 유지하고 수동 동기화하지 않았다.

## 수리 후 전체 재검증 완료 — 2026-10-07

사용자 “수정해”로 같은 범위의 수리를 재개했다. 원인은 시험 준비와 적용 이력 기대값에 있었으므로 승인된 스키마/추가 SQL/실제 업무 서비스는 유지하고 시험2파일·검증기1파일을 수정했다. 앞 절은 최초 검증 당시의 상태이며 현재 완료 기준은 아래 결과다.

- `server/tests/journal-draft-foundation.test.ts:92`: 완료 증빙/업로드/참조를 삭제하지 않고 매 시험 새로운 회사·회계연도·계정·거래처·증빙을 구성한다. 이전 원본은 테스트 소유 DB의 전체 제거 때까지 남긴다. 전표·세션·역할 등 초기화 가능한 자료만 정리한다. 실제 원본 보호 트리거를 유지한 채 통합35개가 통과했다.
- `server/tests/database-foundation.test.ts:257`: 완료된 migration 이름/개수를 실제 SQL 폴더 목록과 대조하고 추가 전표4테이블을 기대 목록에 포함했다. 과거 migration 개별 시험은 당시 목록을 유지한다. DB 시험27개 통과, 격리 DB13migration/26업무테이블 확인. 업그레이드 시험의 과거22테이블 행 보존과 추가4테이블도 통과했다.
- `.artifacts/implementation-f04-journal-draft/verify-completion.mjs:35`: 기존 Mailpit 캡처 API를 회귀 전에 확인하고 HTTP200 여부를 별도 증거로 기록한다. 의존성이 없으면 준비 단계에서 멈추며 새로운 서버를 자동 생성하지 않는다. 중지됐던 기존 Mailpit 컨테이너를 동일 설정으로 재기동했고 기존 메일 회귀59개도 통과했다.

전체 실행: `node .artifacts/implementation-f04-journal-draft/verify-completion.mjs --run-local` 종료0. [명령별 결과](../../.artifacts/implementation-f04-journal-draft/commands.json)의10개 명령 모두 종료0. [수리 첫 집계](../../.artifacts/implementation-f04-journal-draft/repair-first-results.json)와 [최종 집계](../../.artifacts/implementation-f04-journal-draft/results.json)는8조건 모두PASS다. 처음 실패한 실행 보고서는 `first-run/`과 `first-results.json`에 별도로 남겼다.

| 조건 | 결과 | 실행 근거 |
| --- | --- | --- |
| K1 | PASS | 권한/세션/Origin/CSRF/활동16/16, `server-tests.json`의K1명칭 시험. |
| K2 | PASS | 날짜/연도/번호/조회10/10, 같은 해 단기 회계기간·동시 번호·기간 경계 포함. |
| K3 | PASS | 금액/분개/DB 제약30/30, 18자리 범위·정확한 합계·커밋 시 행/헤더 합계 포함. |
| K4 | PASS | 계정/거래처/증빙 참조·연결12/12, 원본 메타데이터 보존 포함. |
| K5 | PASS | 재요청/전체 교체/no-op/version6/6, 동시 수정 하나만 성공·최초 작성자 보존 포함. |
| K6 | PASS | 원자성/경합/감사5/5, 실패 시 번호 미소모·기존 분개 복원·권한/세션 재확인 포함. |
| K7 | PASS | 보호279파일·정책5개·체크139행·기존 산출물13개 보존. 기본 DB 지문 동일·소유 시험 DB 정리. 홈서버23테이블/12기존checksum/계정2개와 업무 행 보존, 추가 SQL 적용0. |
| K8 | PASS | 서버761/761·실패/건너뜀0·DOM80/80·Appearance16/16·build/타입/schema/lint 종료0·문서5개 링크/UTF-8 통과. |

[서버 보고서](../../.artifacts/implementation-f04-journal-draft/server-tests.json)의 새 입력42개·새 통합35개와 기존 회귀를 모두 포함했다. 필수 미검증 항목은 없다. J1~J8 초안 서버 부분만 완료하며 전체 F03/F04 체크139행은 유지한다. 실제 초안 화면과 홈서버 새 SQL/API 반영은 다음 범위 제시/확정 후 진행한다. 승인·확정·원장·기초 잔액·템플릿/보고서/세금 계산은 이 결과에 포함되지 않는다. Hindsight 수동 동기화는 실행하지 않고 기존30분 예약을 유지했다.
