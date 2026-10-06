# F08-11·F08-12 DB 기반과 공통 금액 처리 설계

[문서 인덱스](../README.md) · [공통 기반](08-platform.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **F08-11·F08-12 구현·검증 완료**. 확정일·완료일: 2026-10-05. 사용자 “다음” 뒤에 아래 구현 범위와 파일 목록을 제시했고, 사용자가 이 문서에 “OK”로 동의했다. 영향 작업은 F08-11·F08-12이며 회사·권한 저장 기반은 후속 F01·F08-13, 계정 기반은 F04에서 사용한다. P-01·02·03·04·10의 기존 확정값은 재사용한다.

## 확정한 범위

확정한 범위는 회사·사용자·회사 소속·역할·세션·회계연도·계정과목의 저장 기반과 공통 금액 처리다. 전표·분개·승인·증빙·세무 규칙·확정 보고서의 상세 테이블은 각 기능 설계를 확인한 뒤 추가한다. 기반 테이블을 만드는 것만으로 F01 로그인·권한이나 F04 장부가 완료되지 않는다.

F08-11은 기반 스키마, 추가 마이그레이션, 개발 전용 데이터 및 실제 PostgreSQL 제약 검증을 담당한다. 이후 기능이 필요로 하는 테이블은 그 기능 변경에 포함한다. F08-12는 확정한 금액 정책의 입력·계산·저장 전 검증·문자열 직렬화를 담당한다. 전체 업무 테이블을 먼저 만드는 대안 대신 이번 기반 범위로 확정했다.

기존 요구사항: [운영·인증 정책](01-company-access.md), [첫 회계 범위](07-financial-statements.md#사용자-위임으로-확정한-첫-회계-범위), [금액 정책](08-platform.md#확정한-금액-정책), [계정과목·기초 잔액](04-journals-ledger.md#확정한-계정과목과-기초-잔액). 상세 정책값은 이 문서에 중복 정의하지 않는다.

## DB 구조 제안

기존 `AppMetadata`와 환경 마이그레이션을 보존하고 **새 모델 9개를 구현**했다. 총 모델은 10개이며 전표·분개 금액 필드는 후속 F04에서 추가한다.

| 모델 | 저장할 정보 | 연결·제약의 목적 |
| --- | --- | --- |
| Company | 회사 ID·명칭·장부 통화·본인 승인 설정 | 원화 장부, 본인 승인 기본 금지. 실제 업무 조회·변경 권한은 F01·F08-13에서 검사 |
| User | 사용자 ID·이메일·비밀번호 해시·이메일 확인·사용 중지 상태 | 원문 비밀번호 저장 금지, 정규화한 이메일의 중복 방지. 가입·복구 API는 후속 구현 |
| CompanyMembership | 회사·사용자·활성 상태 | 같은 회사의 중복 소속 방지. 한 사용자의 여러 회사 소속을 허용 |
| CompanyMemberRole | 회사 소속·역할 | 기존 5개 역할과 복수 역할을 저장. 같은 소속·역할의 중복 방지 |
| UserSession | 사용자·세션 식별자 해시·생성/활동/만료/폐기 시각 | 원문 세션 식별자 저장 금지. 실제 로그인·시간 연장·쿠키·CSRF는 F01·F08-13의 범위 |
| FiscalYear | 회사·실제 시작일·종료일 | 날짜 역전·같은 회사의 기간 중복 방지. 짧은 첫 사업연도와 다른 결산월 지원 |
| AccountTemplate | 템플릿 식별자·버전·이름 | 개발 예시와 검토한 실제 계정 템플릿을 구분. 공식 계정 목록·매핑 검토는 F04·F13 |
| AccountTemplateItem | 템플릿 버전·계정 코드·명칭 | 버전 안의 계정 코드 중복 방지. 재무제표·세무 매핑을 임의로 확정하지 않음 |
| CompanyAccount | 회사·계정 코드·명칭·사용 여부·템플릿 출처 | 회사 안의 계정 코드 중복 방지, 회사별 추가·사용 중지 기반. 전표 참조와 사용 계정 삭제 방지는 F04 구현 시 연결 |

구현: 식별자는 UUID, 업무 날짜는 PostgreSQL DATE, 사건 시각은 TIMESTAMPTZ(3)로 구분한다. 역할은 회사 ID와 소속 ID의 복합 외래키로 연결해 다른 회사의 소속에 역할을 붙일 수 없다. 회사 내부 계정 코드와 소속·역할의 중복을 막고 참조 삭제는 Restrict로 제한한다. SQL에서 KRW 통화, 정규화 이메일, 활성 사용자 해시 존재, 세션 해시 형식·시간 순서, 회계연도 날짜 순서를 검사한다. `btree_gist` 확장과 `daterange(..., '[]')` 배제 제약으로 같은 회사의 회계연도 겹침을 거부한다. 양쪽 끝 날짜를 포함하므로 앞 기간 종료 다음 날부터 새 기간을 만들 수 있다. 이 SQL 제약은 Prisma 스키마만으로 표현되지 않으므로 마이그레이션 SQL을 함께 관리한다.

삭제 연쇄로 회사·계정·과거 장부를 함께 지우는 구조는 만들지 않는다. 보존·회원 탈퇴·정식 폐업 처리의 상세 정책을 이 기반 작업에서 임의로 확정하지 않는다. 아직 테이블이 없는 전표·보고서의 보존까지 구현했다고 주장하지 않는다.

## 공통 금액 처리 제안

설정은 기존 `server/src/config/app.config.ts`의 `MONEY_CONFIG`에 모았다. 이 단계에서 통화·입력 자릿수·저장 자릿수·일반 반올림 값을 추가했다. 로그인 시간의 실제 적용은 인증 단계에서 추가하며 별도의 중복 설정 파일을 만들지 않는다.

1. API 입력은 일반 10진수 문자열로 받는다. Number·NaN·Infinity·지수 표기·천 단위 구분 기호를 금액으로 받지 않는다. 단가·수량의 원문 소수 자릿수를 먼저 검사하여 DB의 자동 반올림 전에 초과 입력을 거부한다.
2. Decimal로 계산한다. Prisma의 Decimal 생성자를 clone하여 다른 코드의 전역 정밀도를 바꾸지 않는다. **계산 정밀도는 유효 숫자 80자리**다. 저장 정밀도 24자리의 두 수를 곱하는 경우보다 여유 있게 정한 기술값이다. 유한한 입력의 덧셈·곱셈과 큰 정수는 테스트로 대사했으며 1/3처럼 끝나지 않는 나눗셈은 80자리 계산 정밀도에서 근삿값을 만든다. 무한 정밀도를 보장하는 설정은 아니다.
3. 계산과 저장을 구분한다. 계산 중간값은 임의로 원 단위 반올림하지 않는다. 저장 전에는 확정한 NUMERIC 범위와 소수 자릿수를 검사하고 초과 합계를 잘라 저장하지 않는다.
4. 일반 계산의 최종 원 단위 확정은 명시적인 HALF_UP 함수로 수행한다. 전표 입력은 원 단위를 검증한다. 문자열 직렬화 함수가 금액을 몰래 반올림하지 않는다.
5. API 출력은 지수 표기 없는 10진수 문자열이다. Decimal 객체를 그대로 JSON 응답에 보내거나 Number로 바꾸지 않는다. `0.1 + 0.2`와 Number의 정수 정확성 범위를 넘는 값도 원문과 대사한다.
6. 세무별 계산은 검토된 규칙 버전이 필수다. 공통 함수가 세법별 반올림을 결정하거나 규칙 누락 시 일반 HALF_UP으로 대체하지 않는다. 세무 규칙 실행은 F13·F06에서 구현한다.

`MONEY_CONFIG`는 KRW·입력 6자리·전표 0자리·저장 24/6·정수부 18자리·계산 80자리·HALF_UP을 한 곳에 둔다. 문자열 입력은 불필요한 선행 0·공백·양수 부호도 거부하고 음수 0은 출력 시 `0`으로 정규화한다. 원문 `1.0000000`은 값이 1이어도 초과 자릿수로 거부한다. `serializeAmount`도 저장 검사부터 수행하므로 과도한 소수를 출력하며 몰래 반올림하지 않는다. PostgreSQL의 NUMERIC 캐스트가 초과 소수를 반올림하는 실제 동작과 애플리케이션의 사전 거부를 별도 DB 테스트로 대사했다.

기술 근거: [Decimal clone과 정밀도](https://mikemcl.github.io/decimal.js/), [PostgreSQL 기간 배제 제약](https://www.postgresql.org/docs/current/rangetypes.html), [Prisma 7의 명시적 seed](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding). 세무 계산은 공통 `finalizeWon(..., 'tax')`에서 거부하며 세법별 규칙 실행은 F13·F06에서 구현한다.

## 수정·생성할 파일 목록

아래는 **실제 수정·생성한 경로**다. 최초 수정 대상 [server/prisma/schema.prisma](../../server/prisma/schema.prisma)를 IDE에서 열고 구현했다. 기존 API의 main.ts와 공통 오류 처리 동작은 보존했다. 코드의 F08-11·F08-12 주석에서 추가 목적과 실패 흐름을 찾을 수 있다.

| 구분 | 경로 | 변경 내용 |
| --- | --- | --- |
| 수정 | `server/prisma/schema.prisma` | 기존 AppMetadata 보존, 확정한 기반 모델·관계·인덱스·타입 추가 |
| 생성 | `server/prisma/migrations/20261005010000_business_foundation/migration.sql` | 새 테이블·인덱스·SQL 제약 추가. 기존 마이그레이션 수정·DB reset 없음 |
| 생성 | `server/prisma/seed.ts` | 개발 전용 2개 회사·대역 사용자·소속·역할·회계연도·예시 계정 데이터. 재실행 중복 방지·운영 실행 거부 |
| 수정 | `server/prisma.config.ts` | 개발 seed 실행 경로 등록 |
| 수정 | `server/src/config/app.config.ts` | 확정한 금액 정책 설정을 기존 기준 파일에 추가 |
| 생성 | `server/src/common/money.ts` | 금액 문자열 입력 검사·Decimal 연산·범위 검사·명시적 최종 반올림·문자열 출력 |
| 생성 | `server/src/common/money.schema.ts` | F08-10의 Zod 입력 스키마에서 재사용할 금액 문자열 계약 |
| 생성 | `server/tests/money.test.ts` | 소수·양수/음수 경계·자릿수·오버플로·대수·문자열 전달 테스트 |
| 생성 | `server/tests/database-foundation.test.ts` | 별도 검증 DB의 마이그레이션·관계·회사 구분·중복/기간 제약·seed 재실행 검사 |
| 수정 | `server/package.json` | 개발 seed와 DB 통합 검증 명령, 필요한 직접 의존성만 추가 |
| 수정 | `server/package-lock.json` | seed 실행용 tsx 개발 의존성 고정. Decimal은 기존 Prisma 제공 구현 재사용 |
| 수정 | `docs/features/08-data-money-design.md` | 확정값·실제 구현·검증 근거로 갱신 |
| 수정 | `docs/features/08-platform.md` | 설계 참조와 기반 구현 상태 갱신 |
| 수정 | `docs/IMPLEMENTATION_PLAN.md` | 검증 완료한 F08-11·F08-12만 체크 및 집계 갱신 |
| 수정 | `docs/ENVIRONMENT_SETUP.md` | 새 개발 데이터·검증 DB 실행 명령을 설명 |
| 수정 | `docs/README.md`, `docs/ROADMAP.md` | 문서 참조와 다음 단계 갱신 |
| 수정 | `docs/PROJECT_DECISIONS.md` | 이번 사용자 확정 근거와 기반 구현 상태 기록 |

Prisma가 자동 생성하는 `server/src/generated/prisma/**`는 생성 결과이며 직접 수정하지 않는다. seed의 계정 예시는 개발 검증용이다. 실제 계정과목·세무 규칙의 승인된 버전을 제공한 것으로 표시하지 않는다.

## 구현 순서와 완료 조건

범위 확정 → 설계·파일 설명 → 스키마·SQL → 공통 금액 처리 → 개발 seed → **전체 검증 묶음** → 각 항목 완료 체크 순서로 진행한다. 실제 업무 데이터가 있는 개발 DB나 홈서버에서 reset·데이터 삭제·개발 seed를 실행하지 않는다. DB 검증은 별도 검증 DB에서 수행한다.

- [x] 기존 AppMetadata와 초기 마이그레이션을 보존하고 새 DB에서 전체 마이그레이션이 성공한다.
- [x] 회사 관계·중복·기간·통화 제약을 실제 PostgreSQL에서 확인하고 실패 시 부분 저장이 없다.
- [x] 개발 seed를 두 번 실행해 중복 데이터가 없고 운영 실행 차단을 확인한다.
- [x] 금액 입력·정밀 계산·저장 범위·양수/음수 반올림·문자열 전달과 규칙 누락 시 대체 금지를 검증한다.
- [x] 기존 F08-10 테스트와 새 행동 테스트·TypeScript 검사·빌드를 하나의 묶음으로 통과한다.

문서 작성 자체로 위 체크를 완료하지 않는다. 실제 DB 권한 검사가 없는 상태에서 회사 외래키 검증을 API 접근 통제 완료로 표시하지 않는다. P-05 성능 목표, P-07 증빙 보존 등은 해당 기능의 선행 조건으로 유지한다.

## 코드를 읽는 순서와 실제 실행 흐름

1. [schema.prisma](../../server/prisma/schema.prisma): Company에서 회사 범위를 시작하고 User → CompanyMembership → CompanyMemberRole 관계를 읽는다. UUID는 식별용이고 관계를 제한하는 것은 외래키다. UserSession은 해시와 시각을 저장하는 기반이며 인증 처리는 아직 없다. FiscalYear와 계정 모델이 회사별 자료의 기준이 된다.
2. [migration.sql](../../server/prisma/migrations/20261005010000_business_foundation/migration.sql): Prisma 생성 테이블·외래키 뒤의 F08-11 SQL 주석을 읽는다. CHECK는 잘못된 행을 거부하고 EXCLUDE는 다른 행과 겹치는 기간을 거부한다. 오류가 난 트랜잭션은 부분 저장되지 않는다. 원래 환경 마이그레이션은 수정하지 않았다.
3. [app.config.ts](../../server/src/config/app.config.ts): `MONEY_CONFIG`의 단위와 정밀도를 확인한다. 기존 API 포트 설정의 출력 형태는 바꾸지 않았다. 계산 정밀도와 저장 자릿수는 서로 다른 의미다.
4. [money.ts](../../server/src/common/money.ts): `parseAmount`는 소수 6자리까지, `parseWon`은 정수 문자열만 받는다. 검사한 값을 Decimal로 만든 뒤 `addAmounts`·`multiplyAmounts`·`divideAmounts`로 계산한다. `assertStorable`은 범위와 자릿수를 검사할 뿐 반올림하지 않는다. 일반 계산의 최종 단계에서만 `finalizeWon(value, 'general')`을 호출하고 `serializeAmount`로 문자열을 출력한다. `MoneyError`는 안전한 고정 메시지와 내부 reason을 제공하며 기존 HTTP 필터가 공통 400 형식으로 전달한다.
5. [money.schema.ts](../../server/src/common/money.schema.ts): Zod는 API 입력을 검사하는 라이브러리다. amount/won 스키마는 위 파서를 재사용하고 입력 문자열을 유지한다. 테스트용 HTTP 경로에서 실제 공통 파이프 연결을 확인했고 운영 업무 API는 추가하지 않았다.
6. [seed.ts](../../server/prisma/seed.ts): CLI 진입 시 `assertSeedTarget`을 먼저 실행한 뒤 DB를 연결한다. 조건에 맞지 않으면 연결 전에 종료한다. 함수 import만으로 seed가 실행되지는 않는다. `seedDevelopment`의 단일 트랜잭션과 `upsert(update: {})`는 재실행 시 중복 생성·기존 값 덮어쓰기를 막는다. 다섯 역할은 두 회사의 예시 소속에 나누어 배치했다.
7. [money.test.ts](../../server/tests/money.test.ts)와 [database-foundation.test.ts](../../server/tests/database-foundation.test.ts): 전자는 실제 빌드된 금액 코드와 HTTP 입력을, 후자는 별도 PostgreSQL DB에서 마이그레이션·seed·외래키·기간·롤백·NUMERIC 저장을 검증한다. 테스트의 생성·정리 코드는 기본 DB를 삭제하지 않는다.

## 실행 검증 기록

첫 검증은 행동·스키마/빌드·예약 3개 PASS, 문서 1개 FAIL이었다. 원인은 문서가 제안 상태에 머물러 실제 계산 정밀도·확정 근거를 반영하지 못한 것이다. 이를 수정한 뒤 **전체 검증 묶음을 재실행하여 4개 PASS**를 확인하고 완료 체크를 반영했다.

- `prisma validate`, `npm.cmd run build`, `npm.cmd run check:db`: 각각 종료 코드 0.
- 전체 Vitest 105개 PASS: 금액 45·실제 DB 13·기존 HTTP 계약 34·API 설정 10·헬스 3. seed 재실행, 운영/기본 DB seed 차단, 회사 외래키, 기간 겹침, 트랜잭션 롤백과 NUMERIC 대사 포함.
- 별도 검증 DB에는 두 마이그레이션이 적용됐고 테스트가 생성한 DB만 정리됐다. 로컬 기본 DB에도 추가 마이그레이션 적용 종료 코드 0, 기존 메타데이터 SHA-256 동일, 업무 회사 0개이며 seed 미실행.
- 문서 7개와 로컬 링크, 기존 보호 파일 68개 해시, 작업 ID 139개 및 허용한 완료 체크 전환을 검증한다. Hindsight는 PT30M·Ready 예약을 확인했다.

[테스트 보고서](../../.artifacts/implementation-f08-11-12/tests.json), [명령·종료 코드](../../.artifacts/implementation-f08-11-12/execution.json), [실제 DB 근거](../../.artifacts/implementation-f08-11-12/database-evidence.json), [로컬 마이그레이션 근거](../../.artifacts/implementation-f08-11-12/local-database-evidence.json), [체크 전 검증](../../.artifacts/implementation-f08-11-12/preflight-results.json)을 참조한다. 최종 체크 반영 뒤 `powershell.exe -NoProfile -File .artifacts/implementation-f08-11-12/run-verification.ps1 -Final`로 전체를 재실행하며 결과는 `.artifacts/implementation-f08-11-12/results.json`에 남긴다.

홈서버에 이번 변경을 배포하지 않았고 원격 Hindsight 문서 일치는 확인하지 않았다. 문서 변경은 확정한 30분 예약 주기에 따른다. 실제 회사 접근 제어·로그인·감사 이력은 다음 F01·F08-13에서 범위와 파일 목록을 먼저 제시한다.
