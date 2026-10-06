# 거래처 첫 서버 묶음 제안

[문서 인덱스](../README.md) · [거래처 요구사항](02-counterparties.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **서버 부분 구현·검증 완료**. 제안일·확정일·검증일: 2026-10-06. 확정 근거: 직전 응답의 “C1~C7·서버 파일 15개·API 5개·검증 조건 8개로 확정할까요?”에 사용자가 계정 보안 verify-completion.cjs를 지정해 “확정”이라고 답했다. 제안의 C1~C7 전체·서버 파일15개·API5개·검증8개를 승인했다. 이후 사용자 “수정해”(schema.prisma 지정)로 같은 범위의 수리를 재개했다. 기존 연결 회귀시험1파일을 보완해 수작업 구현·회귀 파일은16개다. 영향 ID: F02-01~04·06/F01-05/F08-13의 거래처 서버 부분. 화면과 상위 전체 완료는 이번 승인에 포함하지 않는다.

## 작업 ID와 순서

영향 ID: F02-01~04·06 및 F01-05·F08-13의 거래처 서버 부분. 확정한 공통 API → DB·금액 → 회사·인증 → 규칙 버전 → 실제 업무 화면의 첫 기반과 회사·계정 화면 묶음을 마친 뒤, [계획서의 단계2](../IMPLEMENTATION_PLAN.md#권장-실행-단계와-선행-조건)에 있는 거래처로 이어가는 제안이다. 필수 P-01·02·03·04·10은 기존 확정값을 재사용한다. 거래처 상세 입력·쓰기 권한은 이번에 별도 확정한다.

먼저 아래 서버 묶음을 승인·구현·일괄 검증하고, 그 뒤 실제 거래처 브라우저 화면의 파일 목록을 제시한다. 서버 완료만으로 F02-02 화면이나 F02 전체를 체크하지 않는다. P-05 규모·성능 목표는 미확정이며 이번 기능 검증으로 대신하지 않는다. 증빙 저장은 P-07, 외부 사업자 확인 연동은 P-06의 별도 결정 대상이다. 이번 묶음은 외부 조회·증빙 파일·전표 저장에 의존하지 않는다.

## 착수 전 근거와 보존할 계약

- [현재 Prisma 스키마](../../server/prisma/schema.prisma)에는 회사·소속·세션·계정·규칙 버전이 있고 거래처 모델은 없다.
- [권한표](../../server/src/auth/access-policy.ts)에는 거래처 권한이 없다. 기존 증빙·전표 쓰기 권한을 거래처 권한으로 임의 대체하지 않는다.
- [회사 접근 guard](../../server/src/auth/company-access.guard.ts)는 경로 companyId로 현재 소속·역할을 검사한다. 세션은 회사 선택을 저장하지 않으므로 화면에서 선택한 회사의 경로를 명시한다.
- [회사 입력 검증](../../server/src/companies/companies.schemas.ts)의 strict 입력·UUID·버전 계약과 [감사 서비스](../../server/src/audit/audit.service.ts)의 허용 사건·원자 저장을 재사용한다.
- 직전 계정 보안은 [실행 증거](../../.artifacts/implementation-f01-account-security-browser/verification-results.json)의 8조건 PASS다. E2E156/API413 등은 직전 실행값이며 이번 거래처 기능의 검증 결과가 아니다.
- AUTH-01~10, 기존 P/F/G139개 체크 상태, 다른 회사·사용자·세션·역할과 과거 마이그레이션은 보존한다. 원격 Hindsight의 최신 성공 여부는 이번 문서 작업에서 확인하지 않았고 문서 변경마다 즉시 동기화하지 않는다.

## 사용자 확인을 받을 선택안 7개

아래 C1~C7의 추천안을 모두 **사용자 확정값**으로 채택했다. 대안은 선택한 값과 구분한다. 확정 근거·확정일·영향 작업 ID는 문서 상단에 기록했다.

| ID | 추천안 | 영향과 대안 |
| --- | --- | --- |
| C1 | 첫 범위는 회사별 거래처 등록·목록·상세·수정·사용 중지의 서버 API5개. 고객/공급/겸용을 지원한다. 화면은 서버 검증 뒤 별도 제안 | 거래 이력·전표·증빙 연결 조회(F02-05), 재활성화·일괄 가져오기는 후속. 한 번에 화면까지 구현하는 대안은 범위와 파일을 추가로 확정해야 한다. |
| C2 | 필수는 name(앞뒤 공백 제거 후 Unicode 코드 포인트1~100)와 kind(CUSTOMER/SUPPLIER/BOTH). 선택 businessNumber는 null 또는 숫자10자리/3-2-5 하이픈 형식이며 저장값은 숫자10자리. 선택 contactName100/email254/phone40/address300/memo1000, 빈 문자열은 null, 문자열 앞뒤 공백 제거·NUL/잘못된 Unicode 거부 | email은 이메일 형식 검사, 나머지 연락 정보는 길이 검사. 번호 형식만 검사하며 실재 사업자·등록 상태·법적 유효성 확인을 주장하지 않는다. 사업자번호 필수 또는 추가 법인번호·주민번호·계좌 필드는 이 안에 없다. |
| C3 | 같은 회사의 null 아닌 정규화 businessNumber는 사용 중지 행을 포함해 유일. 이름 중복과 번호 없는 여러 거래처는 허용. 다른 회사의 같은 번호는 허용 | DB 복합 unique로 동시 등록도 막고 409로 안내. 번호를 선택 항목으로 두어 개인·미등록 상대방을 입력할 수 있다. 이름까지 유일하거나 사용 중지 후 번호 재사용을 허용하는 대안은 별도 정책 선택이다. |
| C4 | counterparties.read는 모든 현재 소속 역할. counterparties.write는 COMPANY_ADMIN/ACCOUNTANT/EXTERNAL_TAX만 허용. APPROVER/READ_ONLY 단독은 조회만. 겸임은 기존 합산 규칙. 일반 업무 쓰기는 CSRF·동일 출처·유효 세션·활동 갱신을 적용하고 추가 비밀번호 재확인은 요구하지 않음 | 기존 AUTH 정책은 유지하며 거래처용 권한만 추가. 수정·사용 중지를 관리자만 허용하거나 매번 재확인하는 대안이 있다. 소속/권한/세션은 쓰기 트랜잭션 잠금 뒤 재검사한다. |
| C5 | UUID 거래처 ID와 회사 복합 식별, active=true/version=1 생성. 수정·중지는 version 필수, 오래된 값409. 최신 동일 값은 no-op(버전/성공 감사 없음). 실제 변경만 version+1. 물리 삭제와 사용 중지 행의 수정·재활성화는 제공하지 않음 | 수정 이력은 감사 ID/변경 필드명/전후 version·active만 보존하고 연락 정보·번호·본문은 감사에 복사하지 않음. 사용 중지는 과거 행/ID를 보존하지만 실제 과거 전표 참조 검증은 전표 구현 때 수행한다. INTEGER 최대에서 변경 거부·동일 값 no-op 허용. |
| C6 | 등록 body의 creationRequestId UUID는 회사별 유일. 정규화 입력 해시와 최초 등록값을 식별하며 같은 ID/입력 재전송은 현재 거래처+created=false, 다른 입력409. 감사와 데이터는 같은 TX. 응답 유실 시 자동 재전송 대신 같은 요청 ID로 명시적 재시도 | 이 계약은 이후 수정된 현재 행을 반환할 수 있고 최초 결과를 복제하지 않는다. 요청 ID를 다른 회사에서 재사용해도 회사 범위가 분리된다. 세션 식별자·CSRF·최대 만료·다른 사용자 세션은 교체하지 않는다. |
| C7 | 목록 q(1~100, 이름/정규화 사업자번호 부분 검색), kind(선택, CUSTOMER/SUPPLIER 필터는 BOTH 포함), active(active/inactive/all, 기본active), limit(기본20/최대100), cursor(UUID). ID 오름차순 고정, 응답 items/nextCursor | cursor가 있으면 현재 회사·같은 검색/필터에 속한 행인지 확인, 위조·회사/필터 불일치400. 필터 변경 시 cursor 초기화. GET은 세션 활동을 연장하지 않음. 사용자 임의 정렬·전체 건수·성능 목표는 후속으로 두고 안정된 한 가지 정렬부터 제공한다. |

## 확정한 API 5개

| 메서드·경로 | 입력·응답과 실패 |
| --- | --- |
| GET /api/companies/:companyId/counterparties | C7 query, 200 { items, nextCursor }. read 권한. |
| POST /api/companies/:companyId/counterparties | strict { creationRequestId, name, kind, businessNumber?, contactName?, email?, phone?, address?, memo? }; 200 { counterparty, created }. write 권한. |
| GET /api/companies/:companyId/counterparties/:counterpartyId | UUID, 200 counterparty. read 권한. |
| PATCH /api/companies/:companyId/counterparties/:counterpartyId | strict { version, name?, kind?, businessNumber?, contactName?, email?, phone?, address?, memo? }; 변경 필드 최소1개, 200 counterparty. active/생성 요청 ID/회사/처리자 입력은 거부. write 권한. |
| POST /api/companies/:companyId/counterparties/:counterpartyId/deactivate | strict { version }, 200 counterparty. write 권한. 최신 중지 행의 반복 중지는 no-op 허용. |

counterparty 응답은 id/companyId/name/kind/businessNumber/contactName/email/phone/address/memo/active/version/createdAt/updatedAt만 명시적으로 구성한다. 입력 해시·처리자 자격 증명·세션은 반환하지 않는다. 선택 필드는 응답에 null을 명시한다.

등록 예시: `{ "creationRequestId": "UUID", "name": "예시 거래처", "kind": "BOTH", "businessNumber": null }`. 설명용 값이며 기본 DB에 생성할 자료가 아니다. 경로의 회사와 본문의 생성 요청 ID는 별도 값이다.

처리: 기존 인증·Origin/CSRF → 회사 guard → strict 검증 → User/세션/회사/현재 소속·역할 잠금과 재검사 → 해당 회사 거래처·버전/중복 검사 → 데이터·허용 감사 원자 저장 → commit 후 최소 응답. 회사 잠금 순서를 기존 회사 서비스와 맞춰 소속 회수와의 경합을 검증한다. 정규화 입력으로 해시를 만들고 필드 순서/선택 필드 null을 고정한다.

입력400, 무효 세션401, 소속·역할403, 현재 접근 가능한 회사 안에서 다른 회사/없는 거래처 ID404, 중복·요청 ID 재사용·버전409를 기존 공통 오류 계약으로 반환한다. HTTP 응답과 로그에 DB 오류문·다른 회사 상세·연락 정보·입력 해시를 노출하지 않는다. 감사 실패는 거래처 변경도 취소한다. 감사 사건은 COUNTERPARTY_CREATED/COUNTERPARTY_UPDATED/COUNTERPARTY_DEACTIVATED의 고정 허용 목록을 코드와 새 SQL에 함께 추가한다.

## 승인 후 구현 파일 15개

다음 목록은 **승인된 구현 범위**다. 첫 요청 파일 schema.prisma를 PhpStorm 실행 파일의 `--line 1` 인수로 열기 요청하고 변경 범위를 설명했다. Prisma 생성 산출물과 build 출력은 아래 수작업 목록에 포함하지 않는다.

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | server/prisma/schema.prisma | 회사 관계·거래처 enum/model·회사/번호와 회사/생성요청 복합 유일·version |
| 생성 | server/prisma/migrations/20261006010000_counterparty_foundation/migration.sql | 새 테이블·제약·기존 감사 사건+새3개, 과거 SQL·행 보존 |
| 수정 | server/src/config/app.config.ts | 거래처 문자열 길이·목록 한도 공통 설정 |
| 수정 | server/src/auth/access-policy.ts | C4의 read/write와 역할 합산 |
| 수정 | server/src/audit/audit.service.ts | 새3사건·필드명/ID/version/active 허용 구조·민감 내용 배제 |
| 생성 | server/src/counterparties/counterparties.schemas.ts | strict 입력·UUID·문자열·번호·query·version 검증과 타입 |
| 생성 | server/src/counterparties/counterparties.service.ts | 회사 범위·잠금·중복·멱등 등록·버전·감사·목록/상세 |
| 생성 | server/src/counterparties/counterparties.controller.ts | API5개·권한/활동·no-store·최소 응답 |
| 생성 | server/src/counterparties/counterparties.module.ts | 서비스/controller 의존성 연결 |
| 수정 | server/src/app.module.ts | 기존 전역 guard·오류 계약을 유지하며 모듈 등록 |
| 생성 | server/tests/counterparty-validation.test.ts | 입력 경계·알 수 없는 필드·cursor/query 검사 |
| 생성 | server/tests/counterparties.test.ts | 실제 DB API·역할·경합·멱등·버전·감사 rollback |
| 수정 | server/tests/database-foundation.test.ts | 새 제약·회사 복합 식별·기존 DB 자료 보존 |
| 수정 | server/tests/access-policy.test.ts | 모든 역할/겸임/기존 권한 회귀 |
| 수정 | server/tests/audit.test.ts | 새 사건 whitelist와 민감 필드/잘못된 사건 차단 |

별도 검증 산출물은 `.artifacts/implementation-f02-counterparties-foundation/`에 명령·결과·임시 DB 전후 증거·8조건 집계로 저장한다. 개발 seed와 기본 DB의 기존 업무 행은 변경하지 않는다. 승인 후 첫 검증은 임시 격리 DB에서 수행한다. 정상 개발 API에 새 SQL을 적용하는 단계는 시험 통과 뒤 데이터 보존 확인과 함께 수행하고 실제 적용 여부를 구분해 보고한다.

## 구현 후 검증 조건 8개 — 모두 PASS

- [x] 입력: C2/C7의 문자열·번호·null·enum·UUID·버전·알 수 없는 필드 경계를 행동 테스트로 확인했다(관련48개).
- [x] 권한: 역할5개·겸임·다른 회사 경로/거래처 ID·중지 소속·폐기 세션의 읽기/쓰기를 API에서 확인했다(관련13개).
- [x] 중복: 같은 회사/다른 회사/번호null/중지 행/동시 생성의 unique 정책과409를 확인했다(관련API2개).
- [x] 등록 재시도: 같은 요청/동일 정규화 입력/다른 입력/회사별 재사용/응답 유실 재시도에서 행·성공 감사 수와 created를 확인했다(관련3개).
- [x] 수정·중지: stale/no-op/최대version·동시 변경·이미 중지·중지 행 수정 거부·잠금 뒤 권한/세션 회수·실패 rollback을 확인했다(관련15개).
- [x] 조회·감사: 필터/고정 정렬/cursor·필터 불일치·최소 응답/no-store·GET 활동 미연장·성공 감사3종/허용 필드·연락 정보 비노출을 확인했다(관련7개).
- [x] DB: Prisma validate/generate·서버 build·임시 DB migration·제약 검사·기존 행 보존·임시 DB 정리와 로컬 기본/기존 브라우저 DB 추가 SQL 적용·기존19테이블씩의 건수/내용 해시 보존을 확인했다.
- [x] 전체 회귀: API502개(기존413개 포함)/21파일·frontend build/lint·Appearance16·기존E2E156이 통과했고 보호188파일/P-F-G139/AUTH10/직전 근거9/첫 실패 기록·현재 UI/API200·거래처 미인증401을 확인했다. 새 브라우저 기능 검증으로 보고하지 않는다.

첫 검증의 FAIL+UNVERIFIED가2개를 넘으면 가장 앞선 실패 계층을 보고하고 수리를 중단한다. 2개 이하면 근본 원인 수리 뒤 같은8조건 전체를 반복한다. 필수 비통과가 남으면 완료 처리하지 않는다.

## 제안 준비 검증 4개

이번 문서 산출물에만 적용한다. 아래 스크립트의 실행 결과가 제안 준비 완료 근거이며 구현 후8조건의 PASS를 뜻하지 않는다.

1. 범위·미확정 표시·작업 ID·C1~C7·선행/후속 경계가 담당/계획/로드맵/인덱스에 일치한다.
2. API5개·구현 파일15개·실행 전 조건8개가 재현 가능한 수로 일치하며 기존/신규 경로를 구분한다.
3. 기존 소스·마이그레이션·테스트·정책·직전8PASS와 P/F/G139·AUTH10을 기준 해시/정확 비교로 보존한다.
4. 변경 문서5개의 UTF-8와 로컬 링크를 검사하고 제안 검증 명령은 종료0이다.

실행 명령: `node .artifacts/proposal-f02-counterparties-foundation/verify.cjs`. [준비 검증 결과](../../.artifacts/proposal-f02-counterparties-foundation/results.json). 확인 요청은 **C1~C7·서버 파일15개·API5개·구현 후8조건**을 대상으로 한다. 첫 서버 묶음 뒤 화면 제안은 별도로 검토한다.

## 첫 구현 검증 실패와 중단 — 2026-10-06 (이전 실행)

위 제안 준비4PASS는 확정 전의 역사 기록이다. 당시 승인된15개 파일의 코드를 작성했지만 기능 검증은 완료하지 못했다. 스키마 검사 `node node_modules/prisma/build/index.js validate`는 종료0·valid이다. 이어 시작한 명령의 공통 래퍼 [이전 command.cjs](../../.artifacts/implementation-f02-counterparties-foundation/first-failed-run/command.cjs)가 Windows cmd에 npm 인수를 인용하면서 `"test"`/`"run"`을 문자 그대로 전달했다. npm은 `Unknown command: ""test""` 또는 `Unknown command: ""run""`으로 종료1했다. TypeScript 컴파일이나 Vitest 본문이 실행된 실패가 아니다.

가장 앞선 실패 계층은 **검증 명령 실행 계약**이다. [이전 실제 명령·종료 코드](../../.artifacts/implementation-f02-counterparties-foundation/first-failed-run/command-results.json), [이전8조건 결과](../../.artifacts/implementation-f02-counterparties-foundation/first-failed-run/results.json)를 보존했다. API 결과 파일이 없으므로 작성한 테스트를 통과했다고 가정하지 않았다. 첫 집계는 UNVERIFIED7·FAIL1로2개를 넘으므로 AGENTS 완료 게이트에 따라 래퍼 수리·명령 재시도·개별 코드 수리를 중단했다. 이후 사용자 “수정해”로 같은 범위의 수리를 재개했다.

| 조건 | 상태 | 실제 근거 |
| --- | --- | --- |
| 1 입력 | UNVERIFIED | counterparty-validation.test.ts 작성, npm test 미실행 |
| 2 권한 | UNVERIFIED | 역할/회사/현재 세션 HTTP 시험 작성, 테스트 실행 실패 |
| 3 중복 | UNVERIFIED | unique/동시 생성 시험 작성, 임시 DB 시험 미실행 |
| 4 등록 재시도 | UNVERIFIED | 정규화/동시 재전송/회사별 생성 ID 시험 작성, 미실행 |
| 5 수정·중지 | UNVERIFIED | 버전/권한 회수 경합/rollback 시험 작성, 미실행 |
| 6 조회·감사 | UNVERIFIED | 필터/cursor/감사/GET 활동 시험 작성, 미실행 |
| 7 DB | UNVERIFIED | schema-command.json 종료0·valid, generate/build/migration·제약·정리 미실행 |
| 8 전체 회귀 | FAIL | api/build/lint/appearance-command.json 각 종료1, npm 인용 오류; db-types/E2E 미실행 |

[당시 읽기 전용 확인](../../.artifacts/implementation-f02-counterparties-foundation/first-failed-run/current-state.json): 당시 기존 UI/API ready는 각각200이며 기본 atms는 public20테이블·적용SQL9개·거래처 테이블 없음이었다. 새 SQL은 기본 DB나 정상 개발 API용 DB에 적용하지 않았고 서비스를 재시작하지 않았다. 보호189파일의 SHA-256·P/F/G139·AUTH10·직전 근거9파일을 정확 비교해 보존했다. `report-first-pass.cjs`의 종료0은 중단 보고와 보존 확인의 성공이며 거래처8조건의 통과가 아니다.

## 코드 설명과 같은 범위의 수리

재개 근거(2026-10-06): 첫 실행 계층 실패 보고 뒤 사용자 “수정해”(schema.prisma 지정)로 승인된 같은 범위의 수리를 요청했다. schema.prisma의 회사/거래처 모델·C1~C7을 확인했고 PhpStorm에78행 열기를 요청했다. 추가 정책이나 새 기능 범위는 선택하지 않는다. 검증 command.cjs에서 npm CLI를 Node로 직접 실행하도록 바꾸고 동일8조건 전체를 재개한다. 기존 첫 실패15파일은 `.artifacts/implementation-f02-counterparties-foundation/first-failed-run/`의 SHA-256 manifest와 함께 보존했다. 결과가 나오기 전에는 완료 체크를 하지 않는다.

재개 첫 실제 집계: [첫 기능 검증 결과](../../.artifacts/implementation-f02-counterparties-foundation/first-functional-run/results.json)는6PASS·2FAIL이다. 입력48·권한13·번호 중복2·재시도3·변경/경합15·조회/감사7의 관련 시험이 통과했고 E2E156도 통과했다. API는495통과·2실패·5미실행/전체502·파일21이며, 기존 루트 연결 기대값 누락과 DB 시험의 잘못된 임시→일반 테이블 외래키가 실패했다. 규칙 시험5개는 격리 migration 명령 실패로 초기화되지 않았다. 비통과2조건이라 기존 게이트에 따라 원인 수리 뒤 동일8조건 전체를 반복한다.

수리 대상 보완: 원래 승인15파일에 [기존 연결 회귀시험 api-contract.test.ts](../../server/tests/api-contract.test.ts)1개를 추가해 실제 CounterpartiesModule 연결을 검증한다(수작업 구현·회귀 파일 합계16). 이는 사용자 “수정해”의 같은 거래처 수리 범위이며 새 업무 정책·API·화면을 추가하지 않는다. DB 시험은 자신이 생성한 난수 DB 안의 일반 검증 테이블을 생성·정상TX에서삭제/오류TX에서rollback하도록 수정한다. 임시 DB의 외래키 시험일 뿐 기본DB에 검증 테이블을 만들지 않는다. 최초 보호 기준은 원본189해시를 보존하고 이 추가 회귀파일만 비교에서 제외해188을 정확 비교한다. 첫 기능 실행19파일은 별도SHA manifest로 보존했다. API1작업자 전체를 먼저 끝낸 뒤 프런트 검사·E2E를 실행하며 기존 시간 제한은 변경하지 않는다.

- [schema.prisma](../../server/prisma/schema.prisma)의 CounterpartyKind(30행), 회사 관계(64행), Counterparty(78행)는 입력과 소유 경계를 표현한다. 회사/번호 unique는 null 번호의 여러 행과 다른 회사의 같은 번호를 허용하며 사용 중지 행의 번호는 계속 예약한다. 생성 요청 ID/해시는 재전송 식별용이고 회사+ID unique는 후속 참조의 회사 일치를 위한 기반이다.
- [추가 SQL](../../server/prisma/migrations/20261006010000_counterparty_foundation/migration.sql)은 트랜잭션 안에서 새 테이블·외래키·길이/번호/version/해시 CHECK·복합 unique와 감사3사건을 추가한다. 실제 DB 제약과 구 테이블 보존 시험이 통과했고 로컬 기본/기존 브라우저 DB에도 적용했다.
- [공통 설정](../../server/src/config/app.config.ts)의 COUNTERPARTY_CONFIG(27행)는 길이와 목록20/100 한도다. [권한표](../../server/src/auth/access-policy.ts)의7행에 새2권한,10행에 공통 조회, 회계 담당자/외부 세무사에 쓰기를 추가한다. 기존 역할 합산과 공통 제한은 유지한다.
- [입력 스키마](../../server/src/counterparties/counterparties.schemas.ts)의5행은 NUL/잘못된 Unicode 거부,24행은 strict 생성,26행은 version+최소1필드 수정,28행은 bounded 목록 query다. 선택 문자열을 null로 정규화하고 번호 하이픈을 제거한다. 비밀번호 입력에는 이 정규화를 적용하지 않는다.
- [서비스](../../server/src/counterparties/counterparties.service.ts)의25행 lockUser와29행 scope는 쓰기 때 DB 잠금 뒤 현재 세션/계정/소속/역할을 재검사한다.49행 list는 회사/필터에 속한 cursor인지 확인해 고정 ID 오름차순으로 limit+1행을 가져온다.68행 create는 정규화 객체의 필드 순서를 고정해 해시하고 같은 생성 ID/해시를 만나면 현재 행을 created=false로 반환한다.
- 같은 [서비스](../../server/src/counterparties/counterparties.service.ts)의95행 change는 먼저 version/active를 검사한다. no-op는 저장/감사 없이 반환하며 실제 변경만 version을 올린다. 번호 unique 실패는 고정409, 없는 회사 범위 거래처는404, 현재 인증/역할 실패는401/403이다. record는 데이터와 같은 TX에 성공 감사를 쓰므로 감사 실패가 전파되면 전부 취소하도록 작성했다.
- [감사 서비스](../../server/src/audit/audit.service.ts)의10행 고정 사건 목록과 COUNTERPARTY 분기는 ID/변경 필드명/version/active만 복사하고 사건·전이·허용 필드명을 검사한다. 연락 정보·번호·입력 해시·원문 요청을 복사하지 않는다.
- [controller](../../server/src/counterparties/counterparties.controller.ts)의10행부터5경로를 기존 전역 인증/회사 guard와 strict 입력·권한·no-store에 연결한다. 쓰기만 UserActivity를 선언하며 GET은 활동을 연장하지 않는다. [module](../../server/src/counterparties/counterparties.module.ts)과 [app.module.ts](../../server/src/app.module.ts)의14행은 기존 DB/세션/감사를 공유해 모듈을 등록한다.
- [validation 시험](../../server/tests/counterparty-validation.test.ts)·[실제 HTTP 시험](../../server/tests/counterparties.test.ts)·[DB 기반 시험](../../server/tests/database-foundation.test.ts)의97/124행·[권한 시험](../../server/tests/access-policy.test.ts)·[감사 시험](../../server/tests/audit.test.ts)이 통과했다. HTTP 시험은 전용 난수 DB 생성/제거와 기본 전체 테이블 해시 비교를 포함한다. 과거 설정 SQL 시험은 당시 허용28사건을 유지하고 새 SQL31사건을 별도로 검사하도록 분리했다.
- 수리한 [api-contract.test.ts](../../server/tests/api-contract.test.ts)의22/248행은 CounterpartiesModule을 실제 루트 연결 기대값에 포함한다. [database-foundation.test.ts](../../server/tests/database-foundation.test.ts)의109행은 임시→일반 외래키라는 PostgreSQL 제한을 피하도록 자신이 만든 격리 DB 안에 검증 테이블을 만들고 같은 TX에서 삭제/rollback한다. schema.prisma는 승인 설계와 일치해 이번 재개 수리에서 추가 변경하지 않았다.

## 최종 실행 검증 — 2026-10-06

[최종8조건 결과](../../.artifacts/implementation-f02-counterparties-foundation/results.json)와 [실제 명령·종료 코드](../../.artifacts/implementation-f02-counterparties-foundation/command-results.json)가 완료 근거다. 집계 명령은 `node .artifacts/implementation-f02-counterparties-foundation/verify-completion.cjs --complete`다. 각 관련 시험 수는 조건별 재사용을 포함하므로 서로 합산하지 않는다.

| 조건 | 상태 | 객관적인 근거 |
| --- | --- | --- |
| 1 입력 | PASS | api-results.json의 입력/strict HTTP 관련48개 |
| 2 권한 | PASS | 역할/권한/HTTP 관련13개와 database-evidence.json의5역할·회사 분리·Origin/CSRF·폐기 검사 |
| 3 중복 | PASS | 번호 unique/동시 생성 API2개와 실제DB 제약 시험 |
| 4 등록 재시도 | PASS | 동일/변경/동시/회사별/응답 유실 관련3개·최소 행/감사 |
| 5 수정·중지 | PASS | 변경/경합/회수/rollback 관련15개 |
| 6 조회·감사 | PASS | 필터/cursor/최소 응답/GET/whitelist 관련7개 |
| 7 DB | PASS | schema/db-types/api exit0·격리 migration10/업무20테이블·기존19테이블 보존·임시 DB 제거·로컬2DB 보존 |
| 8 전체 회귀 | PASS | API502/502·21파일、Appearance16/16、E2E156/156·build/lint exit0·보호188/상위139/AUTH10/직전9/과거 실패 보존·UI/API200·신규 경로401 |

로컬 적용 과정에서 기본 DB 추가 SQL은 성공했으나 브라우저 fixture에 `_prisma_migrations`가 있다고 가정한 inventory가42P01로 실패했다. [최초 적용 기록](../../.artifacts/implementation-f02-counterparties-foundation/local-first-attempt/failure.json)과 당시 script/log를 보존했다. 원인은 [기존 fixture 생성기](../../.artifacts/implementation-f08-accounting-browser/browser-fixture.cjs)의37~44행이 SQL을 직접 적용하는 방식이라는 점이다. 기본 DB SQL을 재실행하지 않고 적용 전 HTTP 시험의19테이블 건수/해시 및 과거9 migration 행 해시와 현재를 비교했다. 브라우저 DB는 적용 전19테이블의 스냅샷을 저장한 뒤 신규 SQL만 BEGIN/COMMIT으로 적용하고 같은 건수/내용 해시를 확인했다. 검증 테이블·seed·업무 행은 정상 DB에 만들지 않았다.

[로컬 DB 근거](../../.artifacts/implementation-f02-counterparties-foundation/local-database-evidence.json): 기본 atms는 public21테이블/Prisma migration10개·과거9개 이력 보존, 기존 브라우저 DB는 public20테이블/Prisma 이력 없음·새 SQL 직접 적용이다. 둘 모두 이전19업무 테이블 건수/내용 해시가 같고 새 거래처0건이다. [현재 런타임 근거](../../.artifacts/implementation-f02-counterparties-foundation/runtime-evidence.json): 기존 개발 API만 재시작했고 UI4173/ready4300은200, 새 거래처 경로는 미인증401이다. 성공한 전체 시험 뒤 로컬 적용/문서 반영까지 포함해 같은8조건을 다시 집계했다.

필수 미검증 항목은 없다. 거래처 브라우저 화면·실제 과거 전표/증빙 참조·P05 규모/성능·외부 사업자 연동·운영 SMTP·원격 Hindsight 최신 동기화는 이번 범위 밖이며 검증하지 않았다. 서버 완료만으로 상위 F02/F01/F08 체크를 변경하지 않았다.
