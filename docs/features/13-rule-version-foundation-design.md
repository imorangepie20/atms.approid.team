# F13-01~03 첫 묶음: 규칙 버전 기반 서버 설계

[문서 인덱스](../README.md) · [회계기준·세법 변경 관리](13-accounting-tax-rules.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **첫 규칙 버전 서버 기반 구현·검증 완료**. 확정·완료일: 2026-10-06. 사용자 확정 근거: 이 범위와 파일 목록에 대한 “확인”. 영향 ID: F13-01·F13-02·F13-03과 F08-11·F08-13의 규칙 조회 서버 부분.

## 작업 범위와 선행 근거

P-01·P-02·P-03·P-04·P-10과 F08-10·11·12의 확정·완료 기록, F01·F08-13 여섯 서버 묶음의 검증 기록을 재사용한다. 확정한 순서인 F01/F08-13 기반 → F13-01~03 규칙 기반 → F08 업무 화면을 유지한다.

이번 묶음은 실제 세율·계산식·법령 해석·신고 서식을 만들지 않는다. 공식 자료와 담당자 검토 없이 법률 값을 seed하지 않으며, 회사별 적용 규칙을 안전하게 조회하고 이후 계산 결과가 참조할 수 있는 불변 버전 구조만 구현한다.

## 사용자 확정값 6개

1. 회계·세무 규칙은 `RuleSet`과 변경하지 않는 `RuleVersion`으로 구분한다.
2. 설정·계산 코드·계정 매핑·서식은 `CONFIG`·`CALCULATION`·`ACCOUNT_MAPPING`·`FORM` 아티팩트 버전으로 따로 기록한다.
3. 회사별 적용 규칙과 적용 기간은 별도 연결 모델에 기록하고 과거 연결을 덮어쓰지 않는다.
4. 계산 코드는 DB에서 실행하지 않는다. 저장소의 식별자와 SHA-256만 기록해 배포 코드와 결과를 연결한다.
5. 첫 API는 `company.read` 권한의 조회만 제공한다. 작성·검토·승인·활성화는 서비스 운영자와 회계 규칙 승인 책임을 확정한 뒤 구현한다.
6. 실제 세율·계산식·법령 해석·신고 서식은 공식 자료 검증 후 별도 범위에서 추가한다. 이번 마이그레이션과 seed에는 업무 규칙 값을 넣지 않는다.

## API와 데이터 흐름

`GET /api/companies/:companyId/rule-applications`는 실제 달력 날짜인 `asOf`, UUID cursor와 1~100 limit만 받는다. 기존 전역 인증 guard와 `company.read` 권한을 사용하며 GET이므로 세션 활동 시각을 연장하지 않는다. 서비스는 현재 활성 소속과 역할을 다시 확인하고 해당 회사의 적용 행만 조회한다.

응답은 회사 적용 기간, 규칙 식별 정보, 공식 근거 메타데이터와 연결된 아티팩트 식별자·버전·SHA-256만 반환한다. 실행 코드 본문, 자격 증명, 다른 회사 적용 행은 반환하지 않는다. 자료가 없으면 빈 목록이며 임의의 최신 규칙이나 기본 세율을 선택하지 않는다.

## 구현 파일 12개와 검증 수리 2개

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `server/prisma/schema.prisma` | 규칙·불변 버전·아티팩트·회사 적용 관계 추가 |
| 생성 | `server/prisma/migrations/20261006000000_rule_version_foundation/migration.sql` | 테이블·복합 외래키·날짜/해시/중복 기간 제약 추가 |
| 생성 | `server/src/rules/rules.module.ts` | 규칙 조회 모듈과 공통 DB·인증 연결 |
| 생성 | `server/src/rules/rules.schemas.ts` | UUID·날짜·cursor·limit strict 조회 입력 |
| 생성 | `server/src/rules/rules.service.ts` | 현재 회사 권한 재검사와 적용 버전 조회 |
| 생성 | `server/src/rules/rules.controller.ts` | company.read 전용 no-store GET API |
| 수정 | `server/src/app.module.ts` | RulesModule 연결 |
| 생성 | `server/tests/rule-version-validation.test.ts` | 날짜·UUID·limit·과다 입력 경계 검증 |
| 생성 | `server/tests/rule-version-foundation.test.ts` | 실제 HTTP·회사 분리·기간·응답 경계 검증 |
| 수정 | `server/tests/database-foundation.test.ts` | 기존 자료 보존과 규칙 DB 제약 검증 |
| 수정 | `docs/features/13-accounting-tax-rules.md` | 첫 기반 범위와 미구현 경계 기록 |
| 수정 | `docs/README.md`·`docs/ROADMAP.md`·`docs/IMPLEMENTATION_PLAN.md` | 인덱스·순서·확정 및 실행 결과 연결 |

문서 세 파일은 하나의 인덱스·계획 기록으로 계산한다. 최초 구현 파일은 `server/prisma/schema.prisma`다. 기존 15개 모델·8개 마이그레이션과 회사·인증 API를 수정하지 않고 새 관계를 추가한다.

검증 과정에서 기존 `server/prisma/migrations/20261005070000_company_self_approval/migration.sql` 첫 줄에 섞인 두 글자를 원래 SQL 주석으로 복구했고, `server/tests/api-contract.test.ts`의 루트 모듈 고정 목록에 `RulesModule`을 추가했다. 두 수정은 승인한 업무 범위를 넓히지 않고 기존 마이그레이션 실행 가능성과 새 모듈 연결 계약을 복원한다.

## 구현 후 묶어서 검증할 조건 8개

- [x] 사용자 확정값·날짜·영향 ID가 담당 문서와 계획에 기록된다.
- [x] Prisma 모델과 추가 SQL의 규칙·버전·아티팩트·회사 적용 무결성 제약이 통과한다.
- [x] 조회 API가 인증된 `company.read` 범위와 strict 입력만 허용한다.
- [x] 회사·규칙 종류·적용 기간이 다른 회사나 다른 규칙의 버전과 결합되지 않는다.
- [x] 계산 아티팩트는 저장소 식별자와 64자리 SHA-256만 저장하며 실행 본문을 저장하지 않는다.
- [x] 기존 15개 테이블과 모든 자료를 보존하고 실제 세율·법령 해석·서식을 seed하지 않는다.
- [x] 신규 행동·입력·DB 업그레이드 테스트와 기존 전체 테스트가 모두 통과한다.
- [x] schema·DB 타입·서버 build와 운영 컨테이너 build/runtime이 모두 통과한다.

위 조건이 모두 PASS일 때 이번 서버 기반 부분만 완료로 기록한다. F13-01~03 전체와 작성·검토·승인·활성화, 실제 공식 규칙 데이터, 계산 선택·충돌·과거 재현 및 업무 화면은 완료 처리하지 않는다.

## 실제 실행 검증 기록

2026-10-06 전체 재검증에서 `npm test -- --reporter=verbose`가 빌드와 19개 테스트 파일의 413개 테스트를 모두 통과했다. `npx prisma validate`, `npm run check:db`, 운영 Docker 이미지 build와 네트워크를 끈 컨테이너의 모듈·strict 스키마 검사가 모두 종료 코드 0이다.

로컬 `127.0.0.1:55432/atms`에는 아홉 번째 마이그레이션을 적용했다. 기존 15개 테이블은 행 수와 SHA-256이 전후 동일하고 새 네 테이블은 빈 상태다. 실제 세율·법령 해석·계산식·신고 서식 seed는 없다. [8개 최종 결과](../../server/.artifacts/implementation-f13-rule-foundation/results.json), [로컬 DB 전후 근거](../../server/.artifacts/implementation-f13-rule-foundation/local-database-evidence.json), [HTTP·DB 행동 근거](../../.artifacts/implementation-f13-rule-foundation/http-database-evidence.json)를 참조한다.

첫 DB 검증의 실패 두 건은 직전 마이그레이션 첫 줄의 우발적인 두 글자가 원인이었고 원래 SQL을 복구한 뒤 전체 기술 검증을 다시 통과했다. 첫 전체 회귀에서는 413개 중 기존 모듈 목록 검사 한 건만 `RulesModule`을 반영하지 않아 실패했으며, 연결 계약을 갱신하고 413개 전체를 다시 실행해 통과했다.
