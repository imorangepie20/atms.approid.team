# F01·F08-13 여섯 번째 묶음: 회사 본인 승인 설정 서버

[문서 인덱스](../README.md) · [회사 권한](01-company-access.md) · [본인 승인 정책](05-approval-closing.md#확정한-본인-승인-정책) · [직전 초대·접근 요청 서버](01-company-invitations-design.md#실제-실행-검증-기록) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **여섯 번째 서버 묶음 구현·검증 완료**. 작성/확정일: 2026-10-05. 영향 ID: F01-01·F01-05·F01-08·F08-13의 서버 부분. 사용자가 이 설계 문서를 지정해 “OK”로 동의하여 아래 여섯 선택·9개 구현 파일·API 1개·8개 검증 조건을 확정했다. 전체 391개 테스트와 여덟 조건을 통과했다. 실제 전표 승인·웹 화면·전체 F01/F08-13 완료와 구분한다.

## 작업 ID와 선행 근거

P-01·P-02·P-03·P-04·P-10과 F08-10·F08-11·F08-12의 확정/완료 기록을 재사용한다. [직전 여덟 조건](../../.artifacts/implementation-f01-company-invitations/results.json)은 모두 PASS이고 [전체 테스트 보고서](../../.artifacts/implementation-f01-company-invitations/tests.json)는 347개/347개 통과다. [로컬 DB 적용](../../.artifacts/implementation-f01-company-invitations/local-database-evidence.json)은 테이블 15개·마이그레이션 7개다. 이들은 직전 완료 증거이며 새 설정 API의 검증이 아니다.

확정한 순서는 F01/F08-13 기반 → F13-01~03 규칙 구조 → F08 업무 화면이다. 이번 묶음은 같은 F01 단계에서 남아 있는 회사 설정의 서버 부분만 연결한다. F05 실제 전표 승인·마감/정정과 실제 웹 화면, 전역 계정 중지·소속 재활성화·기간 정정·운영 배포/SMTP는 이번 범위에 포함하지 않는다. 이번 서버 부분만 완료 처리하며 전체 F01/F08-13 및 F05 체크는 그대로 유지한다.

## 이미 확정한 정책과 현재 코드

- 회사별 본인 승인은 기본 금지다. 회사 관리자만 해당 회사의 설정을 바꾼다. [본인 승인 정책](05-approval-closing.md#확정한-본인-승인-정책)을 다시 결정하지 않는다.
- 설정 변경 자체가 승인 권한을 부여하지 않는다. 승인 실행 시 현재 회사 설정·처리자 역할·작성자·업무 상태를 함께 확인한다. [AUTH-10](01-company-access.md#사용자-위임으로-확정한-인증-기본-정책)을 따른다.
- 설정 변경에는 최근 5분 이내 비밀번호 재확인이 필요하고 처리자·회사·시각·변경 내용을 감사로 기록한다. [AUTH-07·08·10](01-company-access.md#사용자-위임으로-확정한-인증-기본-정책)의 Origin/CSRF·세션 계약을 유지한다.
- [Company 스키마](../../server/prisma/schema.prisma)에 `allowSelfApproval` Boolean 기본 false가 이미 있다. [회사 서비스](../../server/src/companies/companies.service.ts)의 목록/상세/선택 응답에 이 값과 company.version이 있다. 새 회사 생성도 false를 저장한다. 이번 전용 PATCH로 현재 관리자만 이 값을 변경하도록 연결했다.
- [권한 함수](../../server/src/auth/access-policy.ts)의 `canPerform`는 회사 설정·작성자·업무 상태를 전달받아 승인 제한을 계산한다. 실제 전표 서비스에서 현재 DB 값을 읽어 연결하는 기능은 후속 F04/F05이며 이번에 승인 API를 만들었다고 보고하지 않는다.
- [감사 서비스](../../server/src/audit/audit.service.ts)와 [직전 SQL](../../server/prisma/migrations/20261005060000_company_access_flows/migration.sql)은 고정 사건 목록을 각각 코드/DB CHECK로 제한한다. 이번 [추가 SQL](../../server/prisma/migrations/20261005070000_company_self_approval/migration.sql)로 기존 27개 사건과 새 설정 사건을 함께 허용한다. 과거 SQL은 수정하지 않았다.

## 사용자 확정값 6개

| 결정할 항목 | 추천안 | 영향과 대안 |
| --- | --- | --- |
| API와 입력 | `PATCH /api/companies/:companyId/settings/self-approval`, strict 본문 `{ allowSelfApproval: boolean, version: positive integer }`; 응답은 기존 company 최소 형태 | 범용 회사 수정에 섞는 대안보다 설정 변경의 재확인/감사 계약을 따로 표현한다. 조회는 기존 회사 GET을 재사용하고 새 GET은 추가하지 않는다. 문자열 true/false·불필요한 필드는 거부한다. |
| 충돌과 같은 값 재요청 | 기존 company.version을 회사 이름/기간 변경과 공유. 먼저 version을 확인하고 같은 값이면 200 no-op; 실제 변경 때만 version+1/성공 감사 1개 | 오래된 version은 같은 값이어도 409. 최신 INTEGER 최대값에서 실제 변경은 409, 같은 값은 no-op 가능. 별도 설정 version을 추가하는 대안은 이번에 선택하지 않는 추천이다. |
| 트랜잭션과 현재 권한 | 기존 User → 현재 세션 → 회사/처리자 소속/역할 잠금 경로를 재사용. 잠금 뒤 계정/세션·현재 company.manage·최근 5분 재확인·version을 다시 검사 | guard 검사 뒤 권한/세션이 회수되면 저장을 거부한다. 실제 변경과 no-op 모두 동일한 인증/재확인 조건을 적용한다. 현재 회사 서비스 helper를 활용하여 중복 잠금 체계를 만들지 않는다. |
| 감사와 추가 SQL | 고정 사건 `COMPANY_SELF_APPROVAL_CHANGED`, 변경 종류 `self-approval`; 전후 Boolean과 company.version만 명시적으로 기록. 새 SQL은 audit_type_known에 이 사건을 추가 | 감사 기록 실패는 설정/version도 rollback한다. 원문 요청·이메일·토큰을 복사하지 않고 기존 27개 사건을 보존한다. 테이블/모델/열은 추가하지 않아 모델 15개를 유지하며 적용 SQL은 8개가 된다. |
| 세션 영향 | 설정은 역할 부여가 아니므로 기존 식별자/CSRF/초기 절대 만료·다른 기기 세션을 보존. 사용자 작업의 기존 활동 연장만 적용 | 모든 기기를 폐기하거나 식별자를 교체하는 대안은 이번 추천에 포함하지 않는다. 승인 실행 시 현재 설정을 읽는 기존 정책을 유지하고 역할·소속을 바꾸지 않는다. |
| 적용 방향과 이번 검증 경계 | true/false 양방향 변경. 이전 전표 결과를 소급 변경하지 않음. 설정 저장 후 DB 현재 값을 기존 canPerform에 전달하는 정책 경계 검사 | 실제 승인 HTTP 경로의 현재 값 재조회/동시 승인 경합은 F04/F05 구현 시 별도로 검증한다. 이번 정책 함수 검사를 실제 승인 기능 완료로 대체하지 않는다. |

위 표의 여섯 안은 2026-10-05 사용자가 이 문서를 지정한 “OK”로 확정한 값이다. 영향 ID는 F01-01·F01-05·F01-08·F08-13의 서버 부분이며 대안 설명은 선택한 값과 구분한다. 시간값은 기존 [공통 설정](../../server/src/config/app.config.ts)을 재사용하므로 새 설정 파일이나 별도 5분 상수는 만들지 않는다.

## 구현한 API 1개와 실행 흐름

요청 예시: `PATCH /api/companies/{companyId}/settings/self-approval`에 `{ "allowSelfApproval": true, "version": 3 }`. 로그인 쿠키·동일 출처 Origin·CSRF·최근 비밀번호 재확인이 필요하다. `company.manage`가 없는 역할이나 다른 회사는 거부한다.

처리 흐름은 인증/회사 guard → strict 입력 → User/현재 세션/회사 잠금 → 현재 관리자/재확인/version 재검사 → 같은 값 no-op 또는 설정/version/성공 감사 원자 저장 → commit 후 응답이다. 실제 변경 응답 예시는 `{ "id": "회사 UUID", "name": "회사명", "currency": "KRW", "accountingStandard": "K_GAAP", "allowSelfApproval": true, "version": 4 }`이며 기존 companyView 형식을 사용한다. 이 예시의 이름/ID/version은 설명용이며 시험 자료를 기본 DB에 생성하지 않는다.

같은 최신 값 재요청은 저장/version/성공 감사 없이 현재 company를 반환한다. 오래된 version·실제 변경이 불가능한 최대 version은 409, 입력 오류는 400, 인증/권한/재확인은 기존 공통 계약에 따른다. 감사/DB 저장이 실패하면 설정과 version 모두 취소한다. 권한 검사 거부 감사와 guard의 별도 활동 연장은 성공 감사/no-op 보존과 구분한다.

## 구현 파일 9개

최초 수정은 `server/src/companies/companies.schemas.ts`였다. 사용자 확정을 문서에 기록한 뒤 이 파일을 IDE에서 열고 입력/변경 범위를 설명했다. 아래 9개 파일에 상세 주석과 구현/행동 검증을 함께 작성했다.

| 구분 | 구현 파일 | 변경 또는 생성 목적 |
| --- | --- | --- |
| 수정 | `server/src/companies/companies.schemas.ts` | strict Boolean/양의 company.version 입력과 전용 타입 추가. 기존 회사 생성/이름/기간 입력 유지 |
| 생성 | `server/prisma/migrations/20261005070000_company_self_approval/migration.sql` | 트랜잭션 안에서 audit_type_known의 기존 27개 사건+설정 사건 허용. 기존 테이블/행/SQL 보존 |
| 수정 | `server/src/audit/audit.service.ts` | 고정 설정 사건과 self-approval 종류 매칭, 전후 값/version whitelist, 임의 자격 증명/과다 필드 배제 |
| 수정 | `server/src/companies/companies.controller.ts` | 전용 PATCH 1개를 현재 회사 관리 권한·5분 재확인·활동 메타데이터/입력 검증에 연결. 기존 GET 재사용 |
| 수정 | `server/src/companies/companies.service.ts` | 기존 잠금/helper에 재확인·version·no-op·원자 설정/감사 저장 연결. companyView/세션/다른 회사 보존 |
| 생성 | `server/tests/company-settings.test.ts` | 자체 DB+실제 HTTP로 관리 권한/재확인·양방향/no-op/version/경합·감사/DB rollback·세션/회사 보존과 DB 값 기반 권한 함수 경계 검사 |
| 생성 | `server/tests/company-settings-validation.test.ts` | Boolean/정수/UUID·누락/문자열/과다 필드 경계. 기존 입력 계약 보존 |
| 수정 | `server/tests/database-foundation.test.ts` | 적용 SQL 8개/모델 15개·고정 감사 사건 제약. 앞선 7개 SQL 자료에 여덟 번째 SQL 적용 후 모든 기존 행 보존 확인 |
| 수정 | `server/tests/audit.test.ts` | 새 사건/변경 종류·고정 전후 값/version·비밀 미노출, 기존 27개 사건 계약 보존 |

총 수정 6개·생성 3개다. Prisma 스키마·공통 시간 설정·권한표·인증/세션·구성원·초대/요청 서비스·CompaniesModule·메일·패키지·실제 환경/인프라는 보존했다. 새 컴포넌트나 별도 모듈을 추가하지 않고 기존 CompaniesController/CompaniesService 연결을 재사용했다.

## 구현 후 묶어서 검증할 조건 8개

- [x] 현재 관리자만 자기 회사 설정을 바꾸고 비관리자/미확인·중지 계정/타 회사/회수 소속을 거부한다. 기존 회사 조회의 기본 false/현재 값을 확인한다.
- [x] strict Boolean·UUID·양의 INTEGER version과 누락/문자열/과다 입력 경계를 실제 HTTP/입력 검사로 확인한다.
- [x] true/false 양방향 변경, 실제 변경 version+1/성공 감사 1개, 최신 같은 값 no-op·오래된 version·INTEGER 최대 경계와 이름/기간 공유 version 경합을 확인한다.
- [x] 잠금 뒤 계정/처리자 역할/세션/5분 재확인을 다시 확인하고 guard 이후 회수·재확인 만료/오래된 식별자·동시 변경에서 우회 저장하지 못한다.
- [x] 설정/version/성공 감사의 원자성, 감사/DB 실패 rollback과 사건 종류/고정 필드·자격 증명 미노출을 확인한다.
- [x] 회사 이름/기간/소속/역할·다른 회사·기존 식별자/CSRF/초기 절대 만료/다른 기기를 보존하고 Origin/CSRF·GET 읽기 전용·활동 경계를 확인한다.
- [x] 변경 후 실제 DB 회사 값을 canPerform에 전달해 본인 승인 제한/승인 권한 필수/회사 분리/업무 상태 제한을 확인한다. 실제 전표 승인 API 검증과 구분한다.
- [x] 기존 347개 포함 전체 서버 테스트·schema/DB 타입/build/컨테이너·로컬 추가 SQL/구 자료 업그레이드·보호 해시/정책/상위 체크를 한 묶음으로 검증한다. 모두 PASS일 때만 이번 서버 부분 체크를 완료 처리한다.

위 여덟 조건은 아래 전체 실행 증거로 통과한 이번 서버 부분의 완료 조건이다. 실제 전표 승인·화면·운영 배포/메일은 이 체크의 통과 범위가 아니다. 이전 설계 검증은 아래 역사 기록으로 유지한다.

## 이번 설계 문서의 객관적 검증 조건 3개

1. 필수 결정 5개/F08 선행 3개·직전 여덟 PASS/347개 테스트, 기존 AUTH/본인 승인 정책과 현재 DB/코드 근거를 대조한다. 추천안 6개·API 1개·미실행 조건 8개와 사용자 확정 대기를 구분한다.
2. 구현 파일 9개(수정 6/생성 3)의 현재 존재 여부/최초 파일과 담당 문서 8개의 로컬 링크·제목 참조가 정확하다.
3. 코드/테스트/SQL/실제 환경·보호 문서/직전 검증 증거 119개 해시, AUTH 정책 10행·계획 ID/상태 139개·직전 여덟 완료 체크를 보존한다. Hindsight PT30M 예약/현재 상태/마지막 실행 기록은 다시 확인하되 최신 원격 문서 일치는 별도로 미검증 처리한다.

설계 단계의 `python .artifacts/design-f01-company-settings/verify.py`와 [결과](../../.artifacts/design-f01-company-settings/results.json)는 승인/코드 미생성 상태의 역사 기록이다. 설계 문서의 정확성/보존만 의미하며 승인이나 설정 API/추가 SQL 구현의 통과 근거가 아니다. 이번 구현은 `.artifacts/implementation-f01-company-settings/verify.py`에서 별도 여덟 조건으로 검증한다.

설계 검증 기록(2026-10-05): 위 명령 exit 0, 세 조건 모두 PASS다. 첫 검사에서는 추천안 표의 구분선까지 세는 검증 스크립트의 정규식 오류로 첫 조건만 FAIL이었다. 구분선을 제외하도록 수정한 뒤 실패 항목만이 아니라 세 조건 전체를 다시 실행했다. 최초 결과는 `.artifacts/design-f01-company-settings/first-pass-results.json`에 보존한다. 추천안 6개/API 1개/미실행 조건 8개, 구현 예정 파일 9개(수정 6/생성 3), 담당 문서 8개의 로컬 링크 445개/제목 참조 127개를 대조했다. 보호 파일 119개·AUTH 10행·계획 ID/상태 139개·직전 완료 체크 8개와 새 구현 파일 미생성을 확인했다. 로컬 DB는 읽기 전용 조회로 테이블 15개·마이그레이션 7개를 재확인했다. Hindsight는 PT30M·Ready이며 마지막 예약 기록은 2026-10-05 06:35 UTC success다. 이번 최신 문서의 원격 일치는 검사하지 않아 UNVERIFIED이며 예약에 맡긴다. 이 PASS는 설계 문서 검증만 뜻하고 새로운 추천안의 사용자 확정이나 설정 API 구현을 뜻하지 않는다.

## 실제 실행 검증 기록

2026-10-05: `powershell.exe -NoProfile -File .artifacts/implementation-f01-company-settings/run-verification.ps1`로 같은 단계의 모든 검증을 한 묶음으로 실행했다. 첫 전체 검증은 391개 중 390개 통과·1개 실패, 조건 7개 PASS/1개 FAIL이었다. 가장 앞선 실패는 업그레이드 테스트의 시험 자료가 UUID request_id에 문자열을 넣은 입력 계약 오류다. NOT NULL details도 실제 계약에 맞춰 JSON 객체로 명시했다. [첫 조건 결과](../../.artifacts/implementation-f01-company-settings/first-pass-results.json), [첫 테스트 보고서](../../.artifacts/implementation-f01-company-settings/first-batch/tests.json)를 보존한다. 미통과가 1개이므로 완료 게이트에 따라 원인을 수정하고 개별 테스트가 아닌 전체 묶음을 재실행했다.

최종 전체 **391개/391개 PASS**다. 기존 347개를 모두 보존하고 설정 HTTP 행동 20개·입력 경계 22개·기존 DB 업그레이드/고정 사건 제약 1개·감사 1개를 추가했다. schema/build/DB 타입/test·컨테이너 build/runtime·로컬 추가 마이그레이션의 각 종료 코드는 0이다. [체크 전 여덟 PASS](../../.artifacts/implementation-f01-company-settings/preflight-results.json)를 확인한 뒤 이번 여덟 조건만 완료로 체크했다. 최종 문서/체크 반영은 `python .artifacts/implementation-f01-company-settings/verify.py --final`에서 같은 전체 조건으로 확인한다.

[최종 조건 결과](../../.artifacts/implementation-f01-company-settings/results.json), [전체 테스트 보고서](../../.artifacts/implementation-f01-company-settings/tests.json), [HTTP/DB 행동 증거](../../.artifacts/implementation-f01-company-settings/database-evidence.json), [명령 종료 코드](../../.artifacts/implementation-f01-company-settings/execution.json), [컨테이너 기록](../../.artifacts/implementation-f01-company-settings/container-execution.json)을 참조한다. 컨테이너 runtime은 Argon2/운영 쿠키 설정과 모듈·strict 스키마 로딩이며 홈서버 배포를 뜻하지 않는다.

| 조건 | 상태 | 객관적 증거 |
| --- | --- | --- |
| 현재 관리자·회사 범위·인증 | PASS | scopedBidirectionalChange/currentAdminScope/settingAuthentication=true |
| strict Boolean·UUID·version | PASS | strictSettingHttpInput=true, 입력 22개 통과 |
| 양방향·no-op·공유 version·경합 | PASS | settingNoOpAndStaleVersion/settingVersionCeiling/concurrentSettingChange/sharedCompanyVersion=true |
| 잠금 뒤 권한·세션·재확인 | PASS | lockedSettingRecheck_role/membership/account/session/token/reauth 모두 true, exactSettingReauthentication=true |
| 설정/version/감사 원자성·rollback | PASS | settingAuditRollback/settingDatabaseRollback=true, 감사 whitelist 검사 통과 |
| 회사/세션 보존·HTTP 경계 | PASS | settingCompanyAndSessionPreservation/settingHttpProtectionAndReadOnly=true |
| 현재 DB 값과 권한 함수 경계 | PASS | currentStoredSettingPolicyBoundary=true; 실제 승인 HTTP 기능 검증과 구분 |
| 전체 테스트/build/업그레이드·자료 보존 | PASS | 391개 통과, 각 명령 exit 0, 모델/테이블 15개·SQL 8개·보호 파일 112개·AUTH 10행·상위 체크 139개 보존 |

[로컬 DB 증거](../../.artifacts/implementation-f01-company-settings/local-database-evidence.json)는 `127.0.0.1:55432/atms`에 여덟 번째 SQL을 적용해 기존 자료/메타데이터·회사/기간/소속/역할·사용자/세션 및 실제 환경을 보존했음을 확인한다. 기본 DB 회사/사용자/세션은 0/0/0이며 seed를 실행하지 않았다. 빈 기본 DB 보존과 실제 구 자료 보존을 구분한다. [별도 업그레이드 증거](../../.artifacts/implementation-f01-company-settings/foundation-database-evidence.json)는 첫 7개 SQL에 false/true 회사와 이전 감사 사건을 넣고 여덟 번째 SQL 적용 후 기존 15개 테이블의 모든 행을 대조했다. settingUpgradePreservesAllLegacyRows/settingAuditTypeConstraint=true이며 기존 27개/새 사건을 모두 허용하고 알려지지 않은 사건을 거부한다. 검증 DB는 자신이 만든 식별자만 제거했다.

112개 보호 해시는 승인한 구현 파일 9개와 담당 문서 변경을 제외한다. 실제 로컬 적용에 따라 환경 구축 문서에는 기록만 추가했으며 원래 문서 바이트는 그대로 보존했다. 기존 AUTH 10행·계획 ID/상태 139개·직전 초대 서버 여덟 완료 체크는 유지한다. Hindsight PT30M 예약을 새로 확인하며 최신 문서 원격 일치는 UNVERIFIED다. 실제 전표 승인·웹 화면·운영 배포/SMTP는 이번에 구현/검증하지 않았으므로 전체 F01/F08-13와 F05 체크를 완료 처리하지 않는다.

## 사용자가 코드를 이해할 수 있도록 보는 실행 흐름

1. [입력 스키마](../../server/src/companies/companies.schemas.ts) 25~27줄의 주석/정의는 Boolean 자동 변환을 하지 않고 회사 공통 version을 쓰는 이유를 설명한다. `"true"`나 처리자/역할을 함께 보내면 400이다.
2. [컨트롤러](../../server/src/companies/companies.controller.ts) 54~60줄은 관리자 권한·5분 재확인·활동 메타데이터를 PATCH에 선언한다. Origin/CSRF는 기존 인증 guard가 확인한다. 새 쿠키나 역할을 반환하지 않고 no-store 회사 view를 반환한다.
3. [서비스](../../server/src/companies/companies.service.ts) 110~128줄은 기존 lockUser의 true 인자로 최근 재확인을 TX 안에서 다시 확인하고 scope로 현재 소속/권한을 잠금 뒤 읽는다. checkVersion을 값 비교보다 먼저 실행하므로 오래된 같은 값도 409다.
4. 같은 최신 값이면 companyView만 반환한다. 실제 변경은 increment로 설정/version을 조건부 저장하고 감사도 같은 TX에 기록한다. 감사/DB 예외는 설정/version을 취소한다. 회사 이름/기간도 같은 version을 쓰므로 동시에 오래된 값을 덮어쓸 수 없다.
5. [감사 서비스](../../server/src/audit/audit.service.ts) 47~53줄은 고정 사건/변경 종류와 Boolean을 검사하고 전후 값/version 4개만 복사한다. 추가 SQL의 DB CHECK도 같은 28개 사건을 허용한다. 토큰/이메일/임의 details는 성공 감사에 포함하지 않는다.
6. 이 설정은 역할을 부여하지 않으므로 식별자/CSRF/초기 절대 만료·다른 기기 세션을 유지한다. 기존 사용자 활동 연장만 guard에서 수행한다. 이번 DB 값을 canPerform에 전달한 경계 검사는 실제 전표 승인 기능의 현재 값 재조회/동시 경합 검사를 대신하지 않는다.
