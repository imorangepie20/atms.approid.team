# F04-01 회사별 계정과목 첫 서버 묶음 확정 설계와 검증

[문서 인덱스](../README.md) · [구현 계획](../IMPLEMENTATION_PLAN.md) · [전표와 원장](04-journals-ledger.md)

작성일: 2026-10-06. 상태: **첫 서버 묶음8조건 PASS**. 직전 A1~A7·API5·구현 파일16·검증8의 질문에 사용자 “확정”(database-foundation.test.ts 지정)으로 동의했다. 확정일 2026-10-06, 영향 ID F04-01 서버 부분/F08-13 권한·감사. 실제 선택값은 아래 A1~A7 전체이며 과거 “다음”만을 확정 근거로 사용하지 않는다. 서버681/681·schema/타입/build·프런트build/lint/Appearance16을 검증했고 화면·표준 템플릿·홈서버 새 API 배포는 후속이다.

## 다음 작업과 선행 근거

영향 ID: F04-01의 회사 계정 관리 서버 부분, F08-13의 권한·감사 연결. 전표 초안(F04-03~07)과 증빙 연결(F03-04)에 앞서 사용할 계정의 관리 API를 마련하는 제안이다. 첫 서버 검증 → 계정 관리 화면 → 전표 초안·증빙 연결 → 승인·원장 순으로 범위를 제시한다. 이미 확정한 상위 순서를 변경하지 않는다.

기존 [P-10 LEDGER-01](04-journals-ledger.md#확정한-계정과목과-기초-잔액)의 회사별 계정 추가·사용 중지·과거 참조 보존을 재사용한다. P-01·02·03·04·10의 근거는 [필수 게이트](../IMPLEMENTATION_PLAN.md#구현-착수-전-필수-게이트)에 있다. 새 권한·계정 변경 규칙은 이번 사용자 확정으로 승인됐다.

구현 착수 전 소스 근거(아래 미구현 설명은 제안 시점의 기록):

- [CompanyAccount](../../server/prisma/schema.prisma)은 회사·코드·이름·active·템플릿 참조와 코드 유일성을 저장한다. 분류·정상 잔액 방향·충돌 버전·생성 재요청 식별자는 없다.
- [seed](../../server/prisma/seed.ts)의 두 계정은 `ATMS-DEVELOPMENT-ONLY` 예시다. 실제 계정 템플릿의 검토·승인 근거로 사용하지 않는다.
- [역할 정책](../../server/src/auth/access-policy.ts)에 전표 권한은 있지만 계정 관리 권한과 API는 없다. 기존 권한의 허용 범위를 조용히 확대하지 않는다.
- [감사 서비스](../../server/src/audit/audit.service.ts)는 호출자의 트랜잭션과 정해진 사건 필드만 사용한다. 이번 계정 저장도 같은 방식으로 연결한다.

## 확인할 선택값

A1~A7은 2026-10-06 사용자 “확정”으로 선택한 값이다. 직전 제안과 같은 값을 채택했으며 기능 구현·검증 완료와 구분한다.

| ID | 사용자 확정 선택값 | 영향 |
| --- | --- | --- |
| A1 | 목록·상세·추가·이름 수정/미분류 최초 분류·사용 중지 API 5개부터 구현한다. 실제 표준 계정 템플릿은 공식 근거와 목록·매핑 검토 뒤 별도 묶음으로 다룬다. | 수동 계정 관리의 서버 부분이며 F04-01 전체 완료는 아니다. |
| A2 | `accounts.read`는 활성 소속의 다섯 역할, `accounts.manage`는 회사 관리자만 허용한다. 쓰기에 기존 Origin·CSRF·현재 회사·활성 소속 검사를 적용하고 별도 비밀번호 재확인은 요구하지 않는다. | 회계 담당자·외부 세무사는 조회·선택만 가능하다. 겸임 권한 합산은 기존 규칙을 따른다. |
| A3 | 새 계정은 코드·이름·분류·정상 잔액 방향을 입력한다. 코드 1~20자 ASCII 영문/숫자/`_`/`-`, trim·대문자 정규화; 이름 trim 후 코드 포인트 1~100자. 분류 ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE, 방향 DEBIT/CREDIT 명시 선택. | 자산 차감 계정 등도 방향을 자동 추정하지 않는다. 보고서·세무 매핑 승인은 별개다. |
| A4 | 코드와 입력된 분류·방향은 변경하지 않고 이름만 수정한다. 기존 계정의 분류·방향은 null로 보존하며 최초 분류 한 번만 허용한다. | 이름이나 번호로 분류를 추정하지 않는다. 미분류 계정은 조회에 남되 전표 사용 자격은 없다. 향후 재분류는 과거 전표·매핑 영향을 검토한다. |
| A5 | 물리 삭제·재활성화 없이 active=false로 중지한다. 중지된 코드도 재사용하지 않는다. 목록 기본 활성, 필터로 중지/전체 조회. | 과거 참조 보존. 후속 전표 서비스는 중지 계정의 신규 사용 거부를 연결·검증해야 한다. |
| A6 | 생성은 회사+creationRequestId(UUID)+정규화 입력 해시로 재요청을 식별한다. 같은 요청/내용은 같은 ID의 현재 view를 반환하고 다른 내용·동일 코드 충돌은409. 수정·중지는 계정별 version으로 충돌을 검사한다. | DB 유일 제약으로 이중 생성 방지. 현재 version 일치의 동일 값 수정/이미 중지는 no-op이며 감사·version을 늘리지 않는다. |
| A7 | 계정 저장·감사를 같은 트랜잭션으로 처리한다. 계정 ID·정적 변경 필드명·전후 version·사용 여부만 감사한다. 이름·요청 해시는 공개하지 않는다. | 감사 실패도 업무 저장 rollback. 응답 no-store와 기존 안전한 오류 계약을 적용한다. |

## HTTP 계약 초안

공통 경로 `/api/companies/:companyId/accounts`. 기존 인증·회사 guard·입력 검증·오류 필터를 재사용한다. GET은 사용자 활동 만료를 연장하지 않고 쓰기는 기존 활동 선언을 따른다.

| 번호 | 요청 | 입력 / 결과 |
| --- | --- | --- |
| API-1 | GET 기본 경로 | q 최대100자, active=active/inactive/all, 선택 category, UUID cursor, limit 기본20/최대100. 코드/이름 검색·UUID 오름차순 cursor, `{items,nextCursor}`. |
| API-2 | GET `/:accountId` | 회사 범위 계정 view. 다른 회사 ID와 없는 ID는 같은404. |
| API-3 | POST 기본 경로 | `{creationRequestId,code,name,category,normalBalance}` → HTTP200 view. 회사/처리자/active/sourceTemplateItemId/해시 입력 불가. |
| API-4 | PATCH `/:accountId` | `{version,name?,category?,normalBalance?}`; 변경 필드 최소1개. 분류·방향은 둘 다 보내며 미분류 계정만 최초 설정. 중지된 계정 수정409. |
| API-5 | POST `/:accountId/deactivate` | `{version}` → HTTP200 중지 view. |

공개 view: `{id,code,name,category,normalBalance,active,version,canUseInJournal}`. canUseInJournal은 활성+분류/방향 존재의 구조상 자격이며 권한·기간·전표 상태까지 통과했다는 뜻이 아니다. 미지 키·잘못된 UUID/분류/방향/version400, 미인증401, 권한·현재 회사 불일치403, 없는 계정404, 버전/코드/재요청/변경 금지 충돌409.

## DB와 기존 자료 보존 초안

CompanyAccount에 nullable category/normalBalance, version 기본1, nullable creationRequestId/creationInputHash를 추가한다. 기존 행의 분류·요청은 추정하지 않는다. 요청 쌍·분류 쌍의 동시 존재, version 양수·enum 허용값을 DB에서도 검사한다. 서비스의 새 생성은 두 쌍을 반드시 저장한다. 기존 코드 유일성·FK·템플릿 참조를 보존하고 회사별 생성 요청 유일 제약을 추가한다.

기존 코드·이름은 일괄 정규화하지 않는다. 쓰기 전에 회사별 코드의 대소문자/공백 충돌을 조사하며 충돌이 있으면 계정을 변경하기 전에 중단·보고한다. 충돌 없는 회사의 쓰기는 회사 행 잠금 안에서 정규화 코드의 기존 예약도 검사하여 같은 API 경합을 직렬화한다. 기존 DB 코드 유일 제약도 유지한다.

추가 SQL만 사용하고 기존 마이그레이션·seed는 수정하지 않는다. 홈서버 적용 전 충돌 조사·백업·격리 DB 검증이 필요하다. 이번 문서 준비는 DB 적용·운영 API 배포 승인이 아니다.

## 구현 파일 목록과 순서

확정 후 구현 파일16개를 수정/생성한다. 이 설계·담당 문서·계획·인덱스·ROADMAP의 문서5개도 함께 유지한다.

| 번호 | 파일 | 목적 |
| --- | --- | --- |
| 1 | `server/prisma/schema.prisma` | 계정 분류·방향·버전·재요청 필드. |
| 2 | `server/prisma/migrations/20261007000000_company_accounts_foundation/migration.sql` | 추가 제약·감사 사건. 경로 시각은 제안 식별자이며 적용일은 아니다. |
| 3 | `server/src/accounts/accounts.module.ts` | API·Prisma·감사 연결. |
| 4 | `server/src/accounts/accounts.schemas.ts` | strict 입력·정규화·타입. |
| 5 | `server/src/accounts/accounts.service.ts` | 회사 재검사·잠금·중복/버전·감사·view. |
| 6 | `server/src/accounts/accounts.controller.ts` | API5·guard·활동·no-store. |
| 7 | `server/src/app.module.ts` | AccountsModule 등록. |
| 8 | `server/src/auth/access-policy.ts` | 읽기/관리 권한 두 개. |
| 9 | `server/src/config/app.config.ts` | 코드·이름·검색/조회 한도. |
| 10 | `server/src/audit/audit.service.ts` | 사건3개·허용 필드. |
| 11 | `server/tests/account-validation.test.ts` | 정규화·경계·위조 필드 거부. |
| 12 | `server/tests/accounts-foundation.test.ts` | 격리 DB API·경합·버전·감사 rollback. |
| 13 | `server/tests/access-policy.test.ts` | 5역할·겸임·기존 권한 보존. |
| 14 | `server/tests/audit.test.ts` | 새 사건·누출/불일치 거부. |
| 15 | `server/tests/database-foundation.test.ts` | 새 제약·기존 계정/seed 보존. |
| 16 | `server/tests/api-contract.test.ts` | 모듈·공통 HTTP/오류 회귀. |

파일별 목적·입출력·실패 흐름을 주석과 줄 번호로 설명한다. 같은 단계 파일을 묶어 검증한 뒤 다음 화면 범위를 제시한다. 생성 Prisma client/dist는 직접 편집하지 않는다.

## 승인 후 구현 검증 조건

다음8개는 승인 당시 정한 구현 검증 조건이며 이제 전부 PASS다. 문서 준비의3PASS와 구분하고 실제 결과는 아래 실행 기록을 따른다.

1. K1 — strict 입력·정규화·길이·분류/방향 쌍·조회 한도를 테스트 이름/개수로 확인한다.
2. K2 — 실제 HTTP에서 5역할·겸임·회사/소속 회수·Origin/CSRF·다른 회사 ID와 기존 권한 회귀를 확인한다.
3. K3 — API5·필터/cursor·미분류/중지 view를 격리 DB에서 확인한다.
4. K4 — 동일 요청 동시 생성1행·다른 내용409·정규화 코드 중복409·다른 회사 같은 코드 허용을 DB 행 수/응답으로 확인한다.
5. K5 — 수정/중지 경합1성공·구버전409·no-op 불변·코드/기존 분류 변경 거부·비정규 코드 충돌 사전 중단을 확인한다.
6. K6 — 사건3개·허용 필드·이름/해시 미노출·감사 강제 실패 시 전체 rollback을 확인한다.
7. K7 — 격리 DB 추가 SQL/제약과 기존 계정 ID/코드/이름/active/템플릿 참조·업무 테이블/기존 마이그레이션·기본 DB 자료를 전후 비교한다. 새 nullable 필드/version1만 예정 변경으로 분리한다.
8. K8 — schema validate/Prisma 생성·서버 build/check:tests·전체 서버 테스트·프런트 build/lint/Appearance를 묶어 실행하고 기존 배포 페이지/상태를 확인한다. 계정 화면 브라우저 검증은 후속이다.

## 이번 문서 준비의 완료 조건

구현 전 정한3조건: D1 보호 소스/설정197개 보존, D2 기존 P/F/G139항목·정책5문서 보존, D3 문서5개 UTF-8/링크·선택7/API5/파일16/미실행 검증8 일치. [실행 결과](../../.artifacts/proposal-f04-accounts/results.json)를 기록한다. 새 선택의 사용자 확정·기능 구현·상위 체크 완료로 대체하지 않는다.

## 첫 구현 검증과 근본 원인 수리

2026-10-06 첫 전체 실행: [681개 중680PASS/1FAIL/0SKIP](../../.artifacts/implementation-f04-accounts/first-tests.json). 새 입력52·계정HTTP31·역할29·감사13은 통과했고 DB시험24개 중23개 통과였다. [최초 동일8조건 결과](../../.artifacts/implementation-f04-accounts/first-results.json)는6PASS/2FAIL/0UNVERIFIED다. 서버 build/테스트·DB타입/schema와 프런트 build/lint/Appearance16은 통과했다. lint에는 기존 UiIcons.tsx의 불필요한 eslint-disable 경고1건이 있다.

실패 원인은 과거 본인 승인 마이그레이션 시험이 현재 auditTypes에서 일부 후속 사건만 제외해 당시28개에 새 계정 사건3개까지 더한 것이다. 새 API/SQL의 오류가 아니라 과거 계약을 현재 목록에서 추정한 검증 계층의 결합이다. 승인 파일 database-foundation.test.ts에서 당시 SQL의 audit_type_known 허용값을 직접 읽도록 근본 원인을 수리했다. 과거28/31개 기대값과 실제 INSERT/미지 사건 거부 시험은 유지하고 현재 서비스도 해당 사건을 계속 지원하는지 확인한다.

비통과2개 이하이므로 최초 기록을 보존하고 **전체8조건**을 다시 실행해 모두 PASS를 확인했다. 실패 항목만의 실행으로 완료를 판단하지 않았다. 과거 기능의 시험 출력은 실행 전 보관본으로 복구했고 이번 출력은 새 작업 폴더에 별도로 남겼다.

## 코드 실행 흐름과 현재 경계

1. accounts.controller.ts의5경로 → 기존 세션/Origin/CSRF/회사 guard → accounts.schemas.ts의 strict 검증/정규화 → accounts.service.ts 순서다. 조회는 활동 연장을 하지 않으며 결과는 no-store다.
2. 코드는 ASCII 원문을 검사한 뒤 대문자로 바꾼다. ß처럼 대문자화 후 ASCII가 되는 비ASCII 입력도 거부한다. 분류와 방향은 명시적으로 입력하고 방향을 분류에서 추정하지 않는다.
3. 쓰기는 사용자/현재 세션을 재확인하고 회사/소속/역할을 잠근 뒤 회사의 기존 코드를 같은 정규화로 비교한다. 모호한 회사는 안전한409로 계정 변경 전에 중단하며 기존 코드를 자동 수정하지 않는다.
4. 생성은 정규화된 입력의 SHA-256으로 같은 요청의 내용을 확인한다. 동일 요청의 재전송은 현재 view를 반환한다. 새로운 요청의 같은 코드·중지 코드·기존 비정규 코드의 예약 충돌은409다. 해시는 재요청 확인용이며 비밀번호 저장 용도가 아니다.
5. 수정/중지는 현재 version을 먼저 확인한다. 이름의 동일 값·이미 중지는 no-op이다. 최초 분류만 허용하고 기존 분류 재입력·구버전·중지 후 수정은409다. 실제 변경만 version을1올린다.
6. 계정 쓰기와 AuditService의 ACCOUNT_CREATED/UPDATED/DEACTIVATED 사건은 같은 Prisma 트랜잭션이다. 감사 오류/DB 제약 실패는 전체 rollback한다. 감사에는 정적 필드명/ID/버전/사용 여부만 기록하고 원문 이름/코드값/해시는 넣지 않는다.
7. schema.prisma와 추가 SQL은 기존 계정의 원문 필드를 보존하면서 nullable쌍·version1을 추가한다. 정상 잔액 방향은 구조상 분개 자격이며 실제 전표의 기간/권한 검사와 재무제표·세무 매핑은 후속이다.

이번 묶음은 서버 구현이다. 실제 표준 템플릿·계정 브라우저 화면·기초 잔액·전표·원장과 홈서버의 새 API 배포는 이 완료 범위에 포함하지 않는다. 기본 DB/홈서버에 새 마이그레이션이나 seed를 적용하지 않는다. 격리 DB에서만 SQL과 업무 쓰기를 검증한다.

## 전체 재검증 완료 — 2026-10-06

[8조건 최종 결과](../../.artifacts/implementation-f04-accounts/results.json) · [681개 테스트 이름/개수](../../.artifacts/implementation-f04-accounts/tests.json) · [명령과 종료 코드](../../.artifacts/implementation-f04-accounts/commands.json) · [실제 HTTP·기본 DB 지문](../../.artifacts/implementation-f04-accounts/database-evidence.json) · [DB 제약·추가 SQL 보존](../../.artifacts/implementation-f04-accounts/database-foundation-evidence.json) · [공개 HTTPS 상태](../../.artifacts/implementation-f04-accounts/public-health.json)

| 조건 | 상태 | 객관적인 근거 |
| --- | --- | --- |
| K1 | PASS | account-validation52/52와 실제 HTTP의 잘못된 입력400·안전한 오류. |
| K2 | PASS | 역할29/29와 HTTP5역할·겸임·Origin/CSRF·회사 격리·guard 이후 회수5종. |
| K3 | PASS | 계정 HTTP31/31에 API5·필터/cursor·미분류 최초 분류/중지 view 포함. |
| K4 | PASS | 동일 요청 동시 생성1행/감사1·명시적 재시도·같은 코드409·회사별 요청/코드 허용. |
| K5 | PASS | 동시 변경1성공/1충돌·stale/no-op/최대version·모호한 기존 코드의3쓰기 전 중단. |
| K6 | PASS | 감사13/13·새 사건3개·값 미노출·3쓰기 감사 실패/genuine DB 실패 전체 rollback. |
| K7 | PASS | DB24/24·과거22테이블 행 보존·기존 계정 null쌍/version1·기본23테이블 지문 동일/시험DB 정리·보호188파일/P-F-G139/정책5파일 보존. |
| K8 | PASS | 서버26파일681/681·build/check:tests/check:db/schema·프런트build/lint(기존경고1)/Appearance16 각각exit0·공개HTML/ready200·문서UTF-8/링크 정상. |

추가 SQL12개는 난수 격리 DB에 적용했다. 기본 DB의 기존 Prisma migration 행과 업무 자료는 바꾸지 않았다. 프런트 번들 해시는 이전 증빙 미리보기 배포와 동일하며 화면 작업을 서버 시험으로 대신하지 않는다. 전체 F04-01/F04 및 출시 체크·집계를 유지한다.

추가 UNVERIFIED: 새 계정 관리 브라우저 화면과 홈서버 새 API 동작은 해당 구현/배포를 아직 수행하지 않아 확인하지 않았다. 이번 승인 서버 묶음의 필수8조건은 모두 PASS이며 후속 범위를 완료로 보고하지 않는다. Hindsight는30분 예약에 맡기고 수동 동기화하지 않았다.
