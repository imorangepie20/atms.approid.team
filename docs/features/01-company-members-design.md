# F01·F08-13 네 번째 묶음: 회사 구성원·역할·소속 중지 서버

[문서 인덱스](../README.md) · [회사와 사용자 권한](01-company-access.md) · [직전 회사 서버](01-company-foundation-design.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **네 번째 서버 묶음 구현·검증 완료**. 확정일: 2026-10-05. 확정 근거: 사용자가 이 설계 문서를 지정해 “OK”로 동의했다. 영향 ID: F01-02·F01-05·F01-08·F08-13의 서버 부분. 아래 여섯 선택·11개 구현 파일·8개 검증 조건과 같은 F01 단계의 묶음 분할 순서를 확정했다. 첫 전체 검증에서 기존 239개를 포함한 284개 테스트와 8개 완료 조건 모두 PASS였다. 실제 실행 기록은 아래에 별도로 남긴다.

## 작업 ID와 선행 근거

대상은 **F01-02 소속 중지·F01-05 역할 관리·F01-08 회수 후 차단·F08-13 성공 감사**의 서버 부분이다. P-01·02·03·04·10과 F08-10·11·12, 직전 회사 서버 8개 조건/239개 테스트의 완료 근거를 재사용한다. AUTH-01·07·08·10, [5개 역할·권한 합산](01-company-access.md#확정한-역할-구성)과 [회사 관리자 권한](01-company-access.md#확정한-회사-관리자-기본-권한)을 따른다. 이미 확정한 정책을 다시 묻지 않는다.

같은 F01 단계 안에서 **구성원 조회/역할 변경/소속 중지 → 초대·세무사 접근 요청 → 남은 회사 설정·화면**으로 묶음을 나누는 순서로 구현한다. 먼저 마지막 관리자/권한 회수의 기반을 갖추고 다음 초대/요청의 소속 부여를 연결하려는 선택이다. 이번 묶음 분할 순서도 위 사용자 “OK”로 확정했다. 상위 F01·F08-13 → F13-01~03 → F08 업무 화면 순서는 바꾸지 않는다. 전체 F01/F08-13 체크는 이번 부분만으로 완료하지 않는다.

## 재사용할 확정 정책과 현재 구현

- 확정 정책: 회사 관리자가 해당 회사 역할·소속을 관리한다. 역할은 COMPANY_ADMIN/ACCOUNTANT/APPROVER/READ_ONLY/EXTERNAL_TAX 다섯 개이며 겸임 권한을 합산한다. 마지막 활성 회사 관리자 제거는 거부한다. 역할 변경은 최근 5분 비밀번호 재확인이 필요하다.
- 현재 구현: 기존 회사 생성/조회·권한 guard에 구성원 목록/상세·역할 변경·소속 중지 API 4개를 연결했다. 소속 version·마지막 관리자 보호·대상 세션 폐기/본인 교체·고정 성공 감사와 실패 rollback을 실제 HTTP/DB로 검증했다. 초대·접근 요청·재활성화·실제 화면은 구현하지 않았다.
- 구분: 회사 소속의 `active=false`는 그 회사 접근을 중지한다. 전역 User.disabledAt을 수정하거나 다른 회사의 소속/역할을 회수하지 않는다. 전역 계정 정지 기능은 이번 범위에 없다.

## 확정한 구현 범위

1. 현재 관리자에게 해당 회사 구성원 목록/상세를 제공한다. 활성/중지 소속과 계정 확인·중지 상태를 표시하고 현재 역할·소속 version을 반환한다. 다른 회사 구성원·서비스 전체 사용자 목록은 제공하지 않는다.
2. 해당 회사의 활성 소속이며 활성/이메일 확인된 사용자의 역할을 수정한다. 다섯 역할 중 중복 없는 1~5개 배열 전체를 제출하고, 순서만 다른 동일 집합은 변경으로 처리하지 않는다. 임의 권한 문자열·다른 사용자/회사 값을 본문으로 받지 않는다.
3. 회사 소속 중지는 `active=false`로 저장하고 소속 행/역할을 삭제하지 않는다. 이후 guard는 active를 보고 차단한다. 중지된 소속의 역할은 조회할 수 있지만 권한으로 적용하지 않는다. 이미 중지된 소속은 같은 최신 version으로 요청한 경우 변경 없는 결과만 반환한다.
4. 역할/소속 변경 전에 현재 처리자 권한·재확인·세션과 대상 소속 version을 트랜잭션 안에서 재검사한다. 마지막 사용 가능한 관리자가 사라지는 변경은 409로 거부한다. 두 관리자가 동시에 서로를 중지/강등해 관리자가 0명이 되는 경합도 차단한다.
5. 실제 권한 변경·소속 중지·대상 세션 처리·성공 감사를 하나의 DB 트랜잭션으로 처리한다. 감사/세션/제약 실패는 역할/소속까지 rollback한다. 변경 없는 요청은 버전/감사/세션을 불필요하게 바꾸지 않는다.

초대·재발송·수락·세무사 접근 요청/승인·직접 소속 추가·중지 소속 재활성화·사용자 전역 중지·회사 본인 승인 설정 변경·실제 웹 화면은 후속이다. 기존 소속만 관리하며 회사 최초 생성은 기존 API를 유지한다. 회원가입만으로 다른 회사 소속을 부여하지 않는다.

## 이번 범위의 사용자 확정값

아래는 **2026-10-05 사용자 “OK”로 확정한 값이다**. AUTH 정책 10행을 수정하지 않는다.

| 확정한 사항 | 사용자 확정값 | 적용 영향 |
| --- | --- | --- |
| 묶음 분할 순서 | 구성원/역할/소속 중지의 서버 기반을 먼저 하고 초대·접근 요청을 다음 같은 F01 묶음에서 연결 | 실제 초대/요청은 아직 사용할 수 없다. 상위 단계 순서는 유지 |
| 수정 경합 | CompanyMembership.version 양의 INTEGER, 역할/활성 상태의 실제 변경 때만 1 증가 | 오래된 version은 409. 회사 이름/회계연도용 Company.version은 구성원 변경으로 증가시키지 않음 |
| 역할 변경 세션 | 다른 사용자의 역할 변경은 그 대상 계정의 기존 세션 모두 폐기. 본인 역할 변경은 현재 식별자/CSRF 교체·초기 8시간 절대 만료 보존, 본인의 다른 기기 폐기 | 세션이 회사별로 분리되어 있지 않아 대상자는 다른 회사 탭에서도 재로그인이 필요할 수 있다. 다른 회사의 소속/권한은 그대로 |
| 소속 중지 세션 | 대상 계정의 기존 세션 모두 폐기. 본인 중지가 허용되는 경우 현재 쿠키도 지우고 재로그인 안내용 상태 반환 | 처리자가 다른 사용자이면 처리자 세션은 유지. 대상자는 다시 로그인해 다른 활성 회사는 사용 가능 |
| 소속/역할 입력과 조회 | 역할은 중복 없는 비어 있지 않은 전체 집합, 활성·확인된 대상만 역할 수정. 목록은 중지 소속도 포함, 기존 25/100 한도 재사용 | 빈 역할 배열로 접근을 회수하지 않고 소속 중지 경로 사용. 전역 중지/미확인 대상 역할 수정과 중지 소속 재활성화는 이번 범위에서 거부/제외 |
| 소속 중지의 보호 | 소속 중지도 최근 5분 재확인 요구. 마지막 관리자 판정은 active 소속 + COMPANY_ADMIN + 활성/이메일 확인된 계정 | 행만 남아 있는 중지·미확인 관리자를 대체 관리자로 계산하지 않음. 본인 강등/중지는 다른 사용 가능한 관리자가 있을 때만 가능 |

재활성화는 나중의 별도 설계/승인을 기다린다. 중지된 소속의 권한을 이번 API로 되살리지 않는다. 권한 변경 뒤 다른 사용자의 원문 쿠키를 발급하거나 관리자가 다른 사용자의 세션을 얻도록 만들지 않는다. 보편적 의무 방식이라는 주장이 아닌 이 제품의 선택안이다.

## 확정 API 계약

모든 경로는 인증이 필요하다. 기존 `company.members.manage` 권한을 사용하고 GET은 상태/활동 시각을 바꾸지 않는다. PATCH/POST는 Origin·CSRF·최근 5분 재확인·UserActivity를 선언하고 엄격한 스키마를 적용한다. 응답은 `Cache-Control: no-store`이다.

| 메서드·경로 | 입력/권한 | 결과 |
| --- | --- | --- |
| GET `/api/companies/:companyId/members` | company.members.manage, cursor/limit | 해당 회사 소속 목록, 최소 사용자·역할·active·version, 다음 cursor |
| GET `/api/companies/:companyId/members/:membershipId` | company.members.manage, 두 UUID | 현재 회사의 한 소속 상세. 다른 회사/없는 소속 ID는 같은 404 |
| PATCH `/api/companies/:companyId/members/:membershipId/roles` | roles[]·version, 관리자·5분 재확인 | 현재 역할 전체 교체/버전 증가·감사·세션 처리. 본인 변경이면 commit 후 새 쿠키와 최소 세션 정보 |
| POST `/api/companies/:companyId/members/:membershipId/deactivate` | version, 관리자·5분 재확인 | 소속 중지/버전 증가·감사·대상 세션 폐기. 본인 중지면 commit 후 쿠키 삭제와 재로그인 필요 결과 |

목록은 membership UUID 오름차순 cursor이며 cursor도 같은 회사 소속이어야 한다. 사용자 출력은 id·email·emailVerified/disabled 표시만 허용한다. 비밀번호 해시·세션·생성 요청 해시·다른 회사 역할은 제외한다. 역할 변경 본문은 roles/version만, 중지 본문은 version만 받는다. active·임의 내부 필드·다른 companyId/userId 등을 본문에 넣으면 400이다. 활성 상태는 별도 중지 경로에서만 바꾸며 `active=true`를 받아 재활성화하지 않는다.

400 입력/cursor, 401 현재 인증/만료/폐기, 403 처리자 권한/재확인, 404 현재 회사에 없는 대상 소속, 409 오래된 version·마지막 관리자·역할 수정 불가 대상 상태를 공통 오류 계약으로 반환한다. 권한 회수 자체는 회사에만 적용하며 대상 세션의 전역 폐기는 위 새 선택안에 따른 부수 효과다.

## 데이터·잠금·감사와 실패 흐름

- 새 모델은 없다. CompanyMembership에 version INTEGER default 1 및 양수 CHECK만 추가한다. 기존 소속은 1이며 실제 과거 변경 횟수를 추정하지 않는다. User/Company/역할/세션/기존 FK/유일성·기간·금액을 보존한다. 새 추가 마이그레이션만 만든다.
- 신규 쓰기는 회사 행을 잠그고 처리자/대상 소속·역할과 현재 관리자 수를 다시 읽는다. 마지막 관리자 보호는 집계가 필요하므로 단일 행 CHECK로 구현했다고 주장하지 않는다. 모든 소속/역할/초대 승인 등 미래 쓰기도 같은 회사 잠금 규칙을 따라야 한다.
- 다중 계정 잠금은 기존 User → 세션 → Company 순서와 충돌하지 않도록 설계한다. 처리자·대상·현재 관리자 후보들의 User ID를 먼저 수집하고 UUID 순서로 잠근 뒤 처리자 현재 세션 → 회사 → 소속/역할 → 대상 세션을 처리한다. 기존 로그인/복구의 User 잠금과 맞춘다. 회사 잠금 후 현재 관리자 후보 중 아직 잠그지 않은 사용자가 있으면 뒤늦게 순서를 바꾸어 잠그지 않고 409/rollback 후 최신 상태를 재조회한다.
- 사용 가능한 관리자 판정 시 후보 User의 활성/이메일 확인 상태와 소속 active·역할을 확인한다. 후보는 현재 관리자 역할을 가진 계정 전체를 대상으로 수집하여 전역 계정 상태 변경과 경합해도 이미 읽은 상태만으로 관리자를 세지 않는다. 전역 계정 정지 기능을 향후 만들 때에도 마지막 관리자 보호를 별도로 연결해야 하며 이번 API가 그 기능까지 구현한 것은 아니다.
- 처리자 현재 역할과 5분 재확인을 트랜잭션에서 검사한다. target UUID가 다른 회사 소속이면 그 사용자의 행/세션을 변경하지 않는다. 대상 소속 version이 다르면 409이며 INTEGER 최댓값의 추가 증가는 거부한다. 역할 집합/active가 실제로 바뀔 때만 대상 version을 증가한다.
- 본인 역할 변경의 세션 교체는 기존 재검사/절대 만료 보존 helper를 재사용한다. 다른 대상의 세션은 원문을 재발급할 수 없으므로 폐기하고 재로그인하게 한다. 본인 중지는 현재 세션까지 폐기하고 응답에서 쿠키를 지운다. 모든 쿠키 교체/삭제는 commit 이후다.
- 고정 사건 `MEMBER_ROLES_CHANGED`, `MEMBERSHIP_DEACTIVATED`를 AuditService와 DB CHECK에 함께 추가한다. 처리자·회사·요청 ID·시각 및 대상 사용자/소속 ID·전후 역할/active·version·폐기 세션 수를 명시적으로 구성한다. 요청 원문·자격 증명/쿠키·임의 details를 복사하지 않는다.
- 성공 감사 실패/세션 실패/경합은 역할·소속·version·세션까지 함께 rollback한다. 기존 guard의 별도 활동 연장 계약은 유지하며 GET은 연장하지 않는다. 성공 감사 원자성과 활동 시간 갱신을 구분한다.

## 수정·생성할 구현 파일 11개

이번 첫 수정 대상은 **`server/prisma/schema.prisma`**였다. IDE에서 먼저 열고 소속 version이 기존 회사 version과 독립적이라는 변경 범위를 설명한 뒤 승인한 11개 파일을 구현했다. 새 패키지·비밀 환경·메일 설정은 추가하지 않았다.

| 구분 | 경로 | 목적과 구체적인 변경 |
| --- | --- | --- |
| 수정 | `server/prisma/schema.prisma` | CompanyMembership.version default 1. 기존 모델/관계·회사 version 보존 |
| 생성 | `server/prisma/migrations/20261005050000_company_members/migration.sql` | 소속 version 양수 제약과 감사 사건 2개를 추가 SQL로 적용. 구 데이터/기존 마이그레이션 보존 |
| 수정 | `server/src/companies/companies.module.ts` | CompanyMembersController/Service 등록, 기존 회사 API와 Auth/DB 공유 |
| 생성 | `server/src/companies/company-members.schemas.ts` | UUID/cursor·기존 페이지 한도·역할 enum 집합·version·중지 본문의 strict 검증 |
| 생성 | `server/src/companies/company-members.controller.ts` | 위 4개 API, 관리자/재확인/활동 선언과 본인 변경 후 쿠키 교체/삭제 |
| 생성 | `server/src/companies/company-members.service.ts` | 회사 범위 조회·정렬 잠금·현재 역할/마지막 관리자·대상 version·세션·감사 원자 처리 |
| 수정 | `server/src/auth/session.service.ts` | 대상 사용자 세션 폐기 helper와 기존 본인 교체/절대 만료 유지의 재사용. 기존 인증 계약 보존 |
| 수정 | `server/src/audit/audit.service.ts` | 고정 소속/역할 사건과 허용 전후 필드. 기존 15개 사건/자격 증명 미노출 보존 |
| 생성 | `server/tests/company-members.test.ts` | 자체 DB+실제 HTTP로 구성원/회사 분리·역할/상태·마지막 관리자 경합·재확인·세션/감사 rollback 검증 |
| 생성 | `server/tests/company-members-validation.test.ts` | 알려진 5개 역할·빈 배열/중복/위조·version·UUID·cursor·필드 과다 제출 경계 검증 |
| 수정 | `server/tests/database-foundation.test.ts` | 마이그레이션 6개/소속 열·CHECK/구 데이터 보존 검증. 기존 업무/환경 13개 모델 및 제약 유지 |

`companies.service.ts`/기존 로그인·가입·메일/공통 guard·상위 AppModule은 이번 목록에서 변경하지 않는다. 기존 CompaniesModule 연결을 재사용하고 회사 이름/기간/생성 처리도 유지한다. 검증 또는 설계에서 추가 코드 수정 필요가 확인되면 이유와 추가 파일을 제시하고 범위 확인 후 진행한다. 모든 새/수정 영역에 목적·입력/출력·잠금/실패/재로그인 흐름을 상세 주석으로 적는다.

## 구현 후 묶어서 검증할 조건

- [x] 관리자만 자기 회사 구성원을 목록/상세로 조회하고 다른 회사·소속/cursor·미확인/전역 중지/회수된 처리자를 차단한다.
- [x] 알려진 역할 전체 집합·version을 엄격하게 검증하고 겸임 합산·중복/빈 배열/임의 필드/동일 집합의 no-op 계약을 지킨다.
- [x] 마지막 사용 가능한 관리자 강등/중지를 거부하고 본인 변경·전역 중지 후보·동시 상호 변경 경합에서도 회사 관리자가 0명이 되지 않는다.
- [x] 잠금 뒤 처리자 권한·계정/세션·5분 재확인·대상 소속/version을 재검사하고 오래된 수정이나 상태 회복을 허용하지 않는다.
- [x] 역할 변경 때 대상 세션 처리, 본인 쿠키/CSRF 교체·절대 만료 보존과 소속 중지 시 현재 쿠키 삭제를 실제 HTTP로 확인한다. 대상이 아닌 계정의 세션/다른 회사 소속은 보존한다.
- [x] 소속 중지는 그 회사만 active=false로 만들고 행/역할/다른 회사 자료를 보존한다. 중지/이전 식별자 접근을 차단하고 재활성화 경로가 없다.
- [x] 역할·active·version·세션·고정 성공 감사의 원자 저장과 감사 실패 rollback, GET 읽기 전용·Origin/CSRF/활동/절대 만료 경계를 확인한다.
- [x] 기존 239개 포함 전체 서버 테스트·schema/타입/build/컨테이너·로컬 추가 마이그레이션과 보호 자료 검사를 묶어서 통과하고 상위 체크/환경·정책을 보존한다.

위 8개 체크는 아래 실제 실행 증거로 통과한 이번 서버 부분의 완료 조건이다. 실제 초대·요청·재활성화·회사 본인 승인 설정·승인 실행·웹 화면·홈서버/운영 메일 검증을 포함하지 않는다. 전체 F01/F08-13 체크는 그대로 유지한다.

## 이번 설계 문서의 객관적 검증 조건

1. 확정 선행 조건 8개와 직전 회사 서버 8개 PASS/239개 테스트 근거, 새 범위 확인 대기·기존 정책과 새 선택의 구분, 예정 API 4개·미실행 조건 8개가 일치한다.
2. 11개 구현 파일에 중복이 없고 수정/생성 존재 구분과 첫 파일이 맞으며 담당 문서/인덱스/계획/로드맵의 로컬 링크·제목 참조가 유효하다.
3. 모든 기존 서버/인프라/실제 환경·정책 보호 파일 해시, AUTH 정책 10행과 계획의 체크 ID 139개/상태를 보존하고 Hindsight PT30M 예약 상태를 새로 확인한다. 이번 원격 문서 일치는 확인했다고 보고하지 않는다.

설계 단계 검증 명령 `python .artifacts/design-f01-company-members/verify.py`와 그 결과는 코드 미생성 상태의 역사 기록이다. 이번 구현의 별도 검증은 `.artifacts/implementation-f01-company-members/verify.py`에서 수행한다. 설계 단계 PASS는 위 세 조건만 의미한다. 승인 후 코드 파일을 생성하면 현재의 미생성 조건은 역사 기록이 되며 별도 구현 검증을 정의한다.


설계 검증 기록(2026-10-05): 위 명령 종료 코드 0, 세 조건 모두 PASS. 선행 완료 8개·직전 회사 서버 검증 8개 PASS/239개 테스트 기록, 새 API 제안 4개·미실행 기능 조건 8개를 대조했다. 예정 구현 파일 11개(수정 5/생성 6)와 담당 문서 7개의 링크/제목을 검증했다. 보호 코드/환경/정책 파일 83개·AUTH 정책 10행·계획의 체크 ID 139개/상태와 직전 완료 조건 8개를 보존했다. Hindsight는 PT30M·Ready이고 마지막 기록은 2026-10-05 03:35 UTC success이나 이번 변경의 원격 일치는 검사하지 않았다. [설계 검증 결과](../../.artifacts/design-f01-company-members/results.json)를 참조한다. 이 PASS는 구성원 API 구현·새 선택의 사용자 확정·이번 문서 원격 동기화 완료를 뜻하지 않는다.


## 사용자에게 설명할 실행 흐름

1. `schema.prisma`의 CompanyMembership.version은 소속/역할 수정의 비교값이다. 기존 소속은 추가 SQL에서 1을 받고 원래 회사/사용자/역할은 유지한다. Company.version은 회사 이름/기간 변경의 별도 값이며 구성원 변경으로 증가시키지 않는다.
2. `company-members.schemas.ts`는 생성된 CompanyRole enum의 다섯 값만 허용하고 역할 배열을 정렬한다. enum은 DB와 코드가 공유하는 알려진 역할 이름 목록이다. 빈 배열/중복/잘못된 역할·version·임의 사용자/회사/active 필드는 거부한다. 목록은 기존 회사의 중앙 25/100 한도를 재사용한다.
3. `company-members.controller.ts`는 기존 인증 → 회사 권한 guard → 입력 pipe → service 순서에 API 4개를 연결한다. 관리자 조회는 GET으로 세션을 연장하지 않고 쓰기에는 Origin/CSRF/5분 재확인/활동 메타데이터를 선언한다.
4. `company-members.service.ts`의 `change`는 잠글 ID를 수집한 뒤 처리자/대상/관리자 후보 User를 UUID 순서로 잠근다. 잠금은 다른 트랜잭션의 해당 행 변경이 끼어들지 못하도록 DB가 순서를 정하는 것이다. 다음 현재 세션 → 회사 → 소속/역할 순으로 검사한다. 새 관리자 후보가 생겨 앞서 잠그지 못했다면 409/rollback 후 재조회를 요구한다.
5. 잠금 이후 처리자 활성/확인·현재 관리자·유효한 식별자/5분 재확인과 대상 회사/소속/version을 다시 읽는다. 역할 변경은 활성/확인된 활성 소속만 허용하며 중지는 active=false를 쓰고 역할 행은 보존한다. 동일 역할 집합/이미 중지인 최신 요청은 version/세션/감사를 바꾸지 않는다.
6. 실제 변경은 소속 version을 조건부 증가하고 역할 전체를 교체하거나 active=false를 저장한다. 그 회사의 active 소속 + COMPANY_ADMIN + 활성/확인된 계정을 다시 세어 0이면 방금 변경까지 rollback한다. 모든 미래 소속/초대 승인 쓰기도 회사 잠금과 User 잠금 순서를 지켜야 한다. 이 작업은 전역 계정 정지 기능이나 직접 SQL의 모든 경우에 대한 보호까지 구현한 것은 아니다.
7. 본인 역할 변경은 기존 SessionService 교체 helper로 현재 UUID/초기 생성·8시간 절대 만료를 유지하면서 새 식별자/CSRF 해시를 저장한다. 대상이 다른 사람이거나 소속을 중지하면 `revokeForUser`로 해당 계정의 기존 세션을 모두 폐기한다. 다른 회사 소속/역할과 관계없는 계정은 바꾸지 않는다.
8. 역할/active/version·세션·고정 성공 감사는 같은 DB 트랜잭션에서 저장한다. AuditService는 대상 ID·전후 역할/active/version·폐기 수만 구성한다. 실패하면 역할/소속/세션도 취소된다. 컨트롤러의 새 쿠키 전달/본인 중지 쿠키 삭제는 commit 이후에만 한다. guard의 별도 활동 시간 연장은 기존 계약이며 성공 감사의 원자성과 구분한다.

요청 예시: `PATCH /api/companies/{companyId}/members/{membershipId}/roles`에 `{ "roles": ["ACCOUNTANT", "APPROVER"], "version": 1 }`을 보낸다. 로그인 쿠키·Origin·CSRF·최근 재확인이 필요하다. 다른 사용자 변경 결과는 `{ member, session: null }`, 본인 변경은 최소 `{ user, csrfToken, idleExpiresAt, absoluteExpiresAt }` 형태의 session과 새 HttpOnly 쿠키를 반환한다. 소속 중지는 `POST .../deactivate`에 `{ "version": 2 }`를 보내며 본인이 중지되면 `{ member, sessionRevoked: true }`와 쿠키 삭제를 반환한다. 다른 회사 소속을 중지하거나 마지막 관리자를 제거하면 각각 404/409이며 부분 변경을 저장하지 않는다.


## 실제 실행 검증 기록

2026-10-05: `powershell.exe -NoProfile -File .artifacts/implementation-f01-company-members/run-verification.ps1`로 같은 단계의 관련 변경을 한 묶음으로 검증했다. 첫 전체 검증에서 아래 8개 조건은 모두 PASS였고 개별 실패 수리는 필요하지 않았다. 완료 기록 후 `python .artifacts/implementation-f01-company-members/verify.py --final`로 전체 조건과 최종 문서를 함께 대조한다.

전체 테스트 **284개/284개 PASS**다. 기존 239개에 구성원 HTTP/DB 행동 28개·입력 경계 16개·기존 소속 업그레이드 1개를 추가했다. schema/build/DB 타입/테스트, 운영 컨테이너 build/runtime, 로컬 추가 마이그레이션의 각 종료 코드는 0이다. 증거는 [8개 완료 조건 결과](../../.artifacts/implementation-f01-company-members/results.json), [첫 전체 검증 결과](../../.artifacts/implementation-f01-company-members/first-pass-results.json), [테스트 보고서](../../.artifacts/implementation-f01-company-members/tests.json), [HTTP/DB 행동 증거](../../.artifacts/implementation-f01-company-members/database-evidence.json)에 보존한다.

| 조건 | 상태 | 외부에서 확인 가능한 증거 |
| --- | --- | --- |
| 회사 범위·현재 관리자·최소 목록/상세 | PASS | 행동 증거 scopedRead/currentAdminRead/foreignMemberIsolation/memberPagination=true |
| 역할 전체 집합·엄격한 입력·권한 합산·동일 집합 | PASS | strictMemberInput/roleSetAndAudit/roleNoOp=true, 입력 테스트 16개 통과 |
| 마지막 사용 가능한 관리자·동시 상호 변경 | PASS | lastAdminProtection/eligibleAdminCount/mutualDemotion/mutualDeactivation/selfDemotion=true |
| 잠금 뒤 처리자/대상/version/후보 재검사 | PASS | targetEligibility/memberVersionConflict/actorTransactionRecheck/candidateSnapshotConflict=true |
| 대상 기기 폐기·본인 교체/쿠키 삭제 | PASS | targetDeviceRevocation/selfRotation/selfDeactivationCookie/targetLoginRace=true |
| 회사 소속만 중지·반복 요청·재활성화 배제 | PASS | companyOnlyDeactivation/deactivationNoOpAndNoRevival=true |
| 감사/세션 rollback·GET·Origin/CSRF/활동 경계 | PASS | memberAuditRollback/selfCookieCommitBoundary/memberSessionRollback/memberAuditWhitelist/memberReadOnlyAndActivity/memberProtectionBoundaries=true |
| 전체 테스트/타입/build/runtime/마이그레이션·문서/자료 보존 | PASS | 284개 통과, 각 명령 exit 0, 모델/업무 테이블 13개·적용 마이그레이션 6개, 보호 파일 78개·AUTH 정책 10행·계획 ID/상태 139개 보존 |

[로컬 DB 증거](../../.artifacts/implementation-f01-company-members/local-database-evidence.json)의 대상은 `127.0.0.1:55432/atms`이다. 기존 메타데이터 SHA-256 `d47fa71ffbab5aff73533d297152d15fdf3fe2997270287109cb05b153e9174c`와 회사/기간/사용자/소속/역할/세션 자료 및 실제 환경 파일을 보존했다. 기본 DB의 회사/사용자/세션 건수는 0/0/0이며 seed를 실행하지 않았다. 별도 업그레이드 테스트에서는 실제 첫 5개 SQL로 만든 기존 사용자/회사/소속/역할 자료에 여섯 번째 SQL을 적용하여 원래 값 보존·소속 version=1·0 거부를 확인했다. 행동/업그레이드 검증 DB는 자체 생성한 식별자만 제거했다. 기본 DB가 비어 있다는 근거와 구 데이터 보존 행동 테스트를 구분한다.

코드 설명은 [실행 흐름](#사용자에게-설명할-실행-흐름)과 [구성원 서비스](../../server/src/companies/company-members.service.ts), [HTTP 컨트롤러](../../server/src/companies/company-members.controller.ts), [엄격한 입력 스키마](../../server/src/companies/company-members.schemas.ts), [소속 추가 SQL](../../server/prisma/migrations/20261005050000_company_members/migration.sql)에서 확인한다. 상세 주석에 잠금 순서·현재 권한 재검사·version 비교·변경 없는 요청·실패 rollback·commit 이후 쿠키 처리를 설명했다.

검증하지 않은 범위: 초대·접근 요청·재활성화·회사 본인 승인 설정·실제 웹 화면은 이번에 구현하지 않았고 홈서버 배포/운영 메일은 실행하지 않았다. Hindsight는 새로 확인한 PT30M 예약만 사용한다. 마지막 성공 기록이 있어도 최종 변경 문서의 원격 일치는 검사하지 않았으므로 UNVERIFIED다. 이번 서버 부분 완료와 전체 F01/F08-13 완료·원격 동기화를 구분한다.


## 다음 초대·접근 요청 서버 제안

[다음 관리자 초대·세무사 접근 요청 설계](01-company-invitations-design.md)에 14개 구현 파일·11개 API·미실행 조건 8개를 제시했다. 직전 구성원 서비스를 지정한 사용자 “OK”는 이번 완료된 코드의 확인으로 기록하며 다음 새 선택안 8개의 승인이 아니다. 같은 F01 묶음 순서대로 다음 설계를 준비했으며 이 문서의 8개 완료 체크/284개 테스트 근거는 보존한다.


다섯 번째 서버 묶음 확정(2026-10-05): 사용자가 [초대·접근 요청 설계](01-company-invitations-design.md)를 지정해 “ok”로 동의하여 여덟 선택·14개 구현 파일·11개 API·8개 검증 조건을 확정했다. 이전 확인 대기 기록과 구분하며 승인 범위 구현 중이다. 상위 순서·F01/F08-13 체크·AUTH 정책 10행을 유지한다.


다섯 번째 묶음 첫 검증 중단(2026-10-05): [실패 계층과 8개 상태](01-company-invitations-design.md#첫-구현-검증-실패와-수리-중단-기록)를 기록했다. schema/DB 타입 exit 0이나 서버 build exit 2(TS2353: 중첩 역할 입력의 companyId), 컨테이너 build exit 1이다. Vitest/runtime/로컬 추가 SQL은 실행하지 않았다. 7개 UNVERIFIED·1개 FAIL로 완료 게이트에 따라 수리를 중단했다. 승인된 코드는 작성 상태로 남고 기능 완료가 아니다. 기본 DB는 업무 테이블 13개·마이그레이션 6개를 유지하며 상위 체크와 기존 정책을 보존한다.

재개 최신 상태(2026-10-05): [중첩 입력 수정·테스트 초기화 실패·수리 중단](01-company-invitations-design.md#재개-검증-실패와-공통-테스트-초기화-원인). 승인한 2개 파일 수정 후 build/runtime은 통과했다. 전체 347개 중 314개 통과·33개 공통 초기화 실패로 완료되지 않았다. 직전 구성원 묶음의 8개 완료 체크와 284개 테스트 역사 증거는 보존한다.

다음 초대·접근 요청 서버 완료(2026-10-05): [다섯 번째 묶음 실제 실행 기록](01-company-invitations-design.md#실제-실행-검증-기록)의 전체 347개 테스트·8개 조건 PASS를 확인했다. 이 문서의 직전 구성원 8개 체크·284개 테스트 역사 증거와 기존 소속 변경 서비스를 보존한다. 초대/승인은 새 소속만 부여하며 기존 활성/중지 소속 병합·재활성화는 제공하지 않는다.
