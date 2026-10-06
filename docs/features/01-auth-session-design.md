# F01·F08-13 첫 묶음: 인증·세션·권한·감사 서버 기반

[문서 인덱스](../README.md) · [회사와 사용자 권한](01-company-access.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **첫 서버 묶음 구현·검증 완료**. 확정일: 2026-10-05. 첫 설계와 파일 목록 제시 후 사용자가 이 문서에 “OK”로 동의했다. F01-03·05·08 및 F08-13의 서버 부분에 대한 구현 승인 근거다. 이전 DB 설계의 “OK”와 구분하며 후속 가입·회사 관리·화면의 범위 승인으로 확대하지 않는다.

## 작업 ID와 선행 조건

대상은 F01-03·F01-05·F01-08의 서버 부분과 F08-13의 인증·회사 범위·트랜잭션·감사 기반이다. P-01·02·03·04·10 정책 및 F08-10·11·12의 완료 기록을 재사용한다. 확정한 상위 순서 F01·F08-13 → F13 → 업무 화면을 유지하고 같은 F01 단계 안에서 관련 파일을 묶어 검증한다.

정책 기준은 [AUTH-01~10](01-company-access.md#사용자-위임으로-확정한-인증-기본-정책), [권한 합산](01-company-access.md#확정한-권한-합산과-공통-제한), [기본 권한표](01-company-access.md#확정한-기본-권한표), [마감·정정 권한](05-approval-closing.md#확정한-마감과-정정-권한)이다. 상세 정책값을 여기서 새로 확정하거나 변경하지 않는다.

서버는 기존 공통 오류·검증·헬스와 기반 모델에 로그인 API와 요청별 세션·회사/역할 검사를 추가했다. 기존 프런트엔드 Login/Register 폼은 제출 시 preventDefault만 실행하는 템플릿이다. 개발 seed의 중지 계정을 로그인 가능한 계정으로 바꾸지 않는다.

## 확정한 첫 구현 묶음

1. **로그인**: 이메일을 정규화하고 Argon2id 해시를 검증한다. 이메일 확인이 완료된 활성 사용자만 로그인한다. 실패 응답은 계정 없음·비밀번호 오류·사용 중지를 구별하지 않는다. 가입과 이메일 확인 API는 후속 묶음에서 연결한다.
2. **세션**: 안전한 난수 식별자를 쿠키에 전달하고 DB에는 SHA-256 해시만 저장한다. 1시간 미사용 만료와 절대 최대 8시간을 적용한다. 사용자 활동으로 선언한 업무 요청만 연장하며 세션 복원·health·자동 조회는 연장하지 않는다. 여러 기기 세션을 독립적으로 유지하고 현재/전체 로그아웃을 제공한다.
3. **요청 보호**: 공개 API는 명시하고 나머지는 세션 검사를 기본으로 적용한다. 보호 요청마다 사용자 상태와 현재 회사 소속·역할을 DB에서 다시 확인한다. 검증하지 않은 회사 ID를 업무 조회 조건으로 사용하지 않는다. 회사 ID가 포함된 미구현 업무 API를 예시 운영 경로로 만들지 않는다.
4. **CSRF·재확인**: 상태 변경 요청에 Origin과 세션 연결 CSRF 토큰을 검사한다. 로그인은 세션 발급 전이므로 허용 Origin을 먼저 확인한다. 민감 작업에 사용하는 5분 이내 비밀번호 재확인 API를 만든다. GET은 세션 갱신·토큰 교체 같은 상태 변경을 하지 않는다.
5. **권한 기준**: 같은 회사의 역할 허용을 합산하고 공통 제한을 먼저 적용한다. 회사 관리자에게 회계 담당자·승인자 권한을 포함한다. 본인 승인 허용 설정만으로 승인 권한을 부여하지 않는다. 향후 전표·파일·세무 API가 같은 검사 함수를 사용하도록 하되 아직 없는 업무 기능을 완료로 표시하지 않는다.
6. **로그인 제한과 감사**: 계정/IP별 확정한 로그인 제한을 PostgreSQL에서 관리해 프로세스 재시작으로 초기화되지 않게 한다. 로그인·로그아웃·재확인과 접근 거부를 안전한 사건 유형으로 기록한다. 세션 변경과 그 성공 감사 기록은 같은 트랜잭션으로 처리한다. 비밀번호·쿠키·CSRF 원문을 기록하지 않는다.

첫 묶음은 확인된 계정에 대한 실제 서버 동작을 완성하는 범위다. 시험 계정은 별도 통합 테스트 DB 안에서만 생성한다. 기본 DB에 우회 가입·이메일 확인 생략·수동 활성화 경로를 추가하지 않는다.

## 같은 단계의 후속 묶음

- 가입·이메일 확인·복구·발송 제한, 비밀번호 변경과 흔한/유출 비밀번호 차단. [두 번째 서버 묶음의 범위·구현 파일 제안](01-account-lifecycle-design.md)을 작성했으며 사용자 “OK”로 새 범위를 확정해 두 번째 서버 묶음의 구현·검증을 완료했다. 이메일 발송 제공자·발신 주소와 실제 전달 검증은 해당 묶음에서 구체화한다.
- 회사 등록·기본 회계 설정·선택·수정, 사용자 초대·세무사 접근 요청·승인·역할 관리·소속 중지. 먼저 [회사 등록·선택·기간의 세 번째 서버 묶음 제안](01-company-foundation-design.md)을 정리했고 새 범위 확인 대기다. 마지막 관리자 제거 금지, 권한 변경 시 식별자 교체 및 그 감사 기록을 구현한다.
- 로그인·가입·회사 선택·접근 거부·권한별 메뉴의 실제 화면 연결. 파일·전표·보고서의 교차 회사 접근은 해당 업무 API가 만들어진 후 검증한다.

이 후속 범위를 제외한 첫 서버 묶음만으로 **F01-01~08 또는 F08-13 체크박스를 완료하지 않는다**. 체크 단위에 포함된 화면·회사 작업·감사 연결까지 검증한 뒤 완료한다. 첫 묶음의 코드 검증 완료는 별도 근거로 기록한다.

## 실제 API 계약

| 메서드·경로 | 입력과 처리 | 결과와 활동 판정 |
| --- | --- | --- |
| POST `/api/auth/login` | strictObject의 email·password, 허용 Origin, 계정/IP 제한, 해시 검증 | 쿠키와 최소 사용자 정보·CSRF 토큰. 새 세션 시작 |
| GET `/api/auth/session` | 세션 쿠키 확인 | 최소 사용자 정보·CSRF 토큰·미사용/절대 만료 시각. 복원 전용이며 연장 없음 |
| POST `/api/auth/logout` | 세션·Origin·CSRF 검사 | 현재 세션 폐기와 쿠키 삭제 |
| POST `/api/auth/logout-all` | 세션·Origin·CSRF 검사 | 해당 사용자의 모든 세션 폐기와 현재 쿠키 삭제 |
| POST `/api/auth/reauthenticate` | 세션·Origin·CSRF·현재 비밀번호 | 재확인 시각 기록. 비밀번호 변경은 후속 범위 |

실패 응답은 기존 F08-10 `code/message/details` 형식을 재사용한다. 400은 스키마 오류, 401은 인증 실패·만료, 403은 Origin/CSRF·권한 거부, 429는 제한 초과다. 인증 오류를 통해 계정 존재 여부를 노출하지 않는다. 성공 응답에는 해시·원문 세션 식별자·내부 DB 정보를 넣지 않는다.

활동 여부와 요구 권한은 서버의 경로 메타데이터로 선언한다. 클라이언트가 보낸 `activity=true` 같은 값으로 연장을 결정하지 않는다. 첫 묶음의 세션 복원은 비활동이며 이후 사용자 조작용 업무 API와 자동 조회용 API를 구분해 연결한다.

## 실제 저장·설정·기술

- 기존 User·UserSession·CompanyMembership·CompanyMemberRole을 재사용한다. **새 모델은 LoginRateBucket과 AuditEvent 두 개**로 제한한다. 전자는 계정/IP 제한의 기간·횟수·대기 시각, 후자는 사건 ID·처리자·회사·시각·사건 유형·허용한 변경 정보만 저장한다. 로그인 제한 갱신의 동시성은 트랜잭션과 잠금/원자 갱신으로 검증한다.
- AUTH 설정은 기존 `server/src/config/app.config.ts`에 추가한다. 시간·시도 제한·Argon2 비용은 확정 정책을 읽는다. 허용 웹 Origin과 운영/개발 쿠키 조건은 환경 변수에서 검증한다. 운영에서는 HTTPS와 Secure 쿠키를 강제하고 개발 HTTP 예외는 로컬 주소에만 허용한다.
- 비밀번호 검증 도구는 **argon2 0.45.1**이다. PHC 형식 해시 검증을 제공하므로 해시 문자열 파서를 직접 만들지 않는다. cookie-parser 1.4.7과 타입 1.4.10을 함께 잠금 파일에 고정했다. Windows 및 운영 Docker 이미지의 실제 해시·검증을 검사한다. 기존 홈서버 부하 측정은 아직 하지 않았으며 실제 배포 전에 AUTH-03의 측정을 별도로 수행한다.
- 세션 난수·해시·CSRF 비교는 Node crypto를 사용한다. 구현한 CSRF 토큰은 원문 세션 식별자를 키로 하고 고정 용도 문자열을 입력으로 한 HMAC으로 재구성하여 브라우저 새로고침 뒤에도 읽기 전용 세션 복원에서 전달할 수 있게 한다. DB에는 토큰 해시를 저장하고 고정 길이 비교를 사용한다. 쿠키의 원문 식별자를 응답 본문에 반환하지 않는다. 로그인마다 새 식별자에서 토큰을 파생하고 세션 복원은 값을 재구성할 뿐 DB를 변경하지 않는다. 잘못된 토큰을 거부하는 HTTP 테스트를 작성했다. 권한 변경의 식별자 교체는 후속 회사 관리 묶음에서 연결한다.
- 쿠키 파싱은 cookie-parser를 공통 초기화에 연결한다. 프록시 헤더는 현재 Nginx가 전달하지만 전체 `trust proxy=true`를 무조건 설정하지 않는다. 첫 로컬 검증은 직접 연결 IP를 사용한다. 홈서버에서 클라이언트 IP 제한을 활성화하기 전 신뢰할 프록시 경로를 명시적으로 설정하고 위조 헤더와 실제 경로를 검증한다.
- PrismaService는 새 공유 DB 모듈에서 제공해 헬스·인증이 한 연결 풀과 종료 훅을 사용하도록 한다. 감사 서비스는 호출자가 전달한 트랜잭션을 사용하며 성공 기록을 별도 연결에서 먼저 저장하지 않는다.

기술 근거: [NestJS Guards](https://docs.nestjs.com/guards)는 요청 처리 전 접근 검사와 의존성 주입을 지원한다. [node-argon2 공식 프로젝트](https://github.com/ranisalt/node-argon2)는 Argon2 해시 검증·TypeScript와 사전 빌드 바이너리를 제공한다. [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html)는 난수·해시·HMAC·비교 API의 기준이다. 이 문서의 경로·구성 분리는 ATMS 설계 제안이며 공식 문서 자체가 ATMS 보안 검증 결과는 아니다.

## 수정·생성할 구현 파일 목록

아래는 **실제 수정·생성 경로**다. 범위 승인 후 최초 수정 대상 `server/src/config/app.config.ts`를 IDE에서 열고 시간값·보안 설정부터 구현했다. 파일마다 변경 영역을 F01/F08-13 주석으로 표시하고 입력·출력·실패 흐름을 적는다.

| 구분 | 경로 | 역할과 구체적인 변경 |
| --- | --- | --- |
| 수정 | `server/src/config/app.config.ts` | AUTH 설정·시간 단위·허용 Origin·쿠키 조건. 기존 API/MONEY_CONFIG 유지 |
| 수정 | `server/prisma/schema.prisma` | LoginRateBucket·AuditEvent 및 필요한 관계. 기존 모델·데이터 보존 |
| 생성 | `server/prisma/migrations/20261005020000_auth_audit_foundation/migration.sql` | 두 테이블·인덱스·제약 추가. 기존 마이그레이션 수정·reset 없음 |
| 생성 | `server/src/database.module.ts` | PrismaService를 한 번 제공하고 다른 모듈에 export |
| 수정 | `server/src/health.module.ts` | 공유 DB 모듈을 가져오고 중복 Prisma 제공 제거. 헬스 계약 유지 |
| 수정 | `server/src/app.module.ts` | AuthModule 연결. 공개/보호 경로 검사를 의존성 주입으로 등록 |
| 수정 | `server/src/configure-app.ts` | 쿠키 파서와 검증한 프록시 설정 연결. 공통 오류·입력·prefix 유지 |
| 생성 | `server/src/auth/auth.module.ts` | 컨트롤러·인증/세션·제한·감사 서비스와 guard를 조립 |
| 생성 | `server/src/auth/auth.schemas.ts` | 로그인·재확인 입력의 정적 strictObject 계약 |
| 생성 | `server/src/auth/auth.controller.ts` | 위 5개 API와 쿠키 응답. 업무 처리는 서비스에 전달 |
| 생성 | `server/src/auth/auth.service.ts` | 사용자 조회·Argon2 검증·제한 검사·로그인/재확인 조정 |
| 생성 | `server/src/auth/session.service.ts` | 난수/해시·세션 유효성·최대/미사용 만료·활동 연장·폐기·CSRF |
| 생성 | `server/src/auth/login-rate-limit.service.ts` | 계정/IP 제한의 DB 원자 갱신·동시 요청·재시도 가능 시각 |
| 생성 | `server/src/auth/auth.guard.ts` | 공개 경로 구분, 요청별 세션·계정·Origin/CSRF 검사 |
| 생성 | `server/src/auth/access-policy.ts` | 역할 허용 합산·관리자 포함 권한·본인 승인 등 공통 제한 |
| 생성 | `server/src/auth/company-access.guard.ts` | 회사 식별자 검증·현재 소속/역할 확인 후 보호 요청 허용 |
| 생성 | `server/src/auth/auth.decorators.ts` | 공개 여부·요구 권한·활동 판정·재확인 필요 여부의 선언 |
| 생성 | `server/src/auth/auth.types.ts` | 검증한 사용자·세션·회사 범위의 요청 타입. 클라이언트 값과 구분 |
| 생성 | `server/src/audit/audit.service.ts` | 허용한 사건 정보만 같은 트랜잭션에 기록. 원문 비밀값 제외 |
| 수정 | `server/package.json`, `server/package-lock.json` | argon2·cookie-parser 및 필요한 타입만 추가·버전 고정 |
| 수정 | `server/.env.example` | 비밀값 없는 Origin·운영/개발 설정 예시 |
| 생성 | `server/tests/auth-session.test.ts` | 실제 HTTP+별도 PostgreSQL로 인증·쿠키·CSRF·만료·로그아웃·제한 검증 |
| 생성 | `server/tests/access-policy.test.ts` | 5개 역할·겸임·관리자 포함·회사 분리·현재 권한 회수·재확인 경계 |
| 생성 | `server/tests/audit.test.ts` | 사건 필드 제한·민감정보 미노출·업무 실패 시 감사 포함 롤백 |
| 수정 | `server/tests/database-foundation.test.ts` | 새 마이그레이션 수·테이블 목록 반영, 기존 제약·seed 보존 |
| 수정 | `server/tests/api-contract.test.ts` | 첫 검증에서 확인한 기존 모듈 연결 가정을 공유 DB·AuthModule에 맞춰 갱신. 기존 HTTP 행동 검사 유지 |

담당 문서는 `docs/features/01-auth-session-design.md`, `01-company-access.md`, `08-platform.md`, `docs/IMPLEMENTATION_PLAN.md`, `ENVIRONMENT_SETUP.md`, `PROJECT_DECISIONS.md`, `ROADMAP.md`, `README.md`를 갱신한다. 생성된 Prisma 파일은 직접 편집하지 않는다. 첫 묶음의 프런트엔드 구현 파일은 없으며 회사 CRUD·초대·이메일·화면 파일은 다음 묶음의 목록에 제시한다.

## 구현 후 검증할 조건

- [x] 확인된 활성 계정만 로그인하고 실패 종류·입력 비밀값이 응답과 로그에 드러나지 않는다.
- [x] 쿠키 조건·서버 저장 해시·Origin/CSRF·기본 보호 경로·공개 헬스 계약을 실제 HTTP에서 확인한다.
- [x] 60분 미사용 및 8시간 절대 만료, 활동/비활동, 만료 세션 부활 금지와 기기별 독립성을 제어한 서버 시각으로 검증한다.
- [x] 현재/전체 로그아웃·사용 중지·소속 해제·권한 회수 이후 보호 요청을 거부하고 다른 회사/사용자 세션을 보존한다.
- [x] 역할 합산·관리자 포함·미부여 거부·본인 승인 공통 제한·5분 재확인 경계를 검증한다.
- [x] 계정/IP 제한과 동시 요청을 실제 DB에서 확인하고 프로세스 재시작으로 제한이 사라지지 않는다.
- [x] 인증 상태 변경과 감사의 트랜잭션 원자성, 민감정보 제외와 회사 구분을 검증한다.
- [x] 기존 API·금액·DB 테스트를 포함한 서버 타입·빌드·전체 행동 테스트를 한 묶음으로 통과하고 보호 데이터/환경 파일을 보존한다.

위 체크는 이번 첫 서버 묶음의 실제 테스트로 통과했다. 교차 회사 검사에는 테스트 전용 경로를 사용했으며 아직 없는 실제 전표·파일·보고서 API의 검증으로 확대하지 않는다. 설계 검증 PASS와 기능 구현 PASS를 구분한다. 실제 홈서버 해시 부하·프록시 IP·이메일 발송·웹 사용자 흐름은 해당 구현/배포 단계의 별도 검증이다.

## 구현 전 설계 문서 검증 기록

`python .artifacts/design-f01-auth-session/verify.py` 종료 코드 0, 검증 3개 PASS: 확정 선행 조건 8개와 새 범위 확인 대기 상태, 예정 구현 파일 26개·문서 5개·로컬 링크 262개와 제목 참조 78개, 기존 코드/정책 파일 92개 해시·체크 ID 139개 보존을 확인했다. Hindsight 예약은 PT30M·Ready이며 원격 문서 일치는 확인하지 않았다. [검증 결과](../../.artifacts/design-f01-auth-session/results.json)를 참조한다. 이 링크 추가 뒤 전체 문서 검증을 다시 실행하므로 최종 로컬 링크 수는 결과 파일을 기준으로 한다.

## 실제 코드를 읽는 순서

1. [app.config.ts](../../server/src/config/app.config.ts): `AUTH_POLICY`의 밀리초·Argon2 KiB와 `readAuthConfig`의 Origin/운영 HTTPS/개발 루프백 검사. 기존 API 기본값과 MONEY_CONFIG는 그대로 유지했다.
2. [AppModule](../../server/src/app.module.ts) → [AuthModule](../../server/src/auth/auth.module.ts): 인증 컨트롤러·서비스와 전역 guard 등록. [DatabaseModule](../../server/src/database.module.ts)은 헬스와 인증에 같은 PrismaService를 제공한다. 서비스 인스턴스를 기능마다 중복 생성하지 않는다.
3. [AuthGuard](../../server/src/auth/auth.guard.ts): 요청 ID 발급 → 공개 헬스 구분 → 변경 요청 Origin 검사 → 로그인/재확인 IP 제한 → 세션 및 CSRF/재확인 검사. 공개 여부를 선언하지 않은 경로는 기본 보호된다. 잘못된 JSON처럼 guard 전에 실패하는 요청은 기존 공통 오류 계층이 처리한다.
4. [CompanyAccessGuard](../../server/src/auth/company-access.guard.ts): 서버가 선언한 요구 권한 → 회사 UUID 검사 → 현재 DB 소속/역할 확인 → 회사 컨텍스트 생성 → 허용된 활동 요청의 만료 갱신. 입력의 회사/역할 플래그를 인증 자료로 복사하지 않는다. GET은 활동 표시가 있어도 갱신하지 않으며 실제 사용자 조작용 업무 조회의 POST 연결은 후속 기능에서 설계한다.
5. [AuthController](../../server/src/auth/auth.controller.ts) → [AuthService](../../server/src/auth/auth.service.ts): 로그인·로그아웃·재확인 API의 strict 스키마와 고정 응답. 로그인 실패는 트랜잭션을 commit한 뒤 401을 던져 실패 횟수를 보존한다. 없는 계정도 대역 Argon2 검증 비용을 거친다. 비밀번호 공백은 보존한다.
6. [SessionService](../../server/src/auth/session.service.ts): 난수 식별자·해시·CSRF 생성, 매 요청 계정/만료 확인, 조건부 만료 연장, 응답 허용 필드 구성. 재확인은 5분 미만만 유효하다. 세션 복원은 no-store이고 원문 쿠키·DB 해시를 응답 본문에 넣지 않는다.
7. [LoginRateLimitService](../../server/src/auth/login-rate-limit.service.ts): 계정/IP 키의 SHA-256 → PostgreSQL advisory lock → 최근 15분 시각 배열 → 원자 갱신. advisory lock은 같은 DB 키의 동시 변경을 순서대로 처리하는 트랜잭션 잠금이다. 키를 SQL 파라미터로 전달하며 프로세스 메모리에 제한 횟수를 저장하지 않는다. 재확인에도 같은 비밀번호 추측 제한을 적용한다.
8. [AccessPolicy](../../server/src/auth/access-policy.ts)·[AuditService](../../server/src/audit/audit.service.ts): 역할 합산과 관리자 포함 권한, 작성자/업무 상태 공통 제한; 고정 사건 유형과 reason만 기록한다. 전표 승인 서비스는 후속 단계에서 DB의 작성자·상태를 읽어 canPerform를 호출해야 한다. 역할 허용 검사만으로 실제 전표 승인을 완료했다고 표현하지 않는다.

운영에서는 `NODE_ENV=production`과 명시적 `AUTH_WEB_ORIGIN=https://atms.approid.team`이 필요하다. 개발 HTTP에서는 Origin과 HOST가 모두 루프백이어야 한다. 프록시 신뢰·실제 이메일 발송·회사 관리·웹 화면은 후속 범위이며 이 버전을 홈서버에 배포하지 않았다.

## 첫 서버 묶음 완료 근거

완료일: 2026-10-05. 스키마 검증·서버 build·seed/config 타입 검사는 각각 종료 코드 0이다. 전체 Vitest **144개 PASS**: 인증 DB/HTTP 19·권한/설정 17·감사 계약 3·기존 금액 45·DB 13·HTTP 34·API 설정 10·헬스 3. 신규 39개와 기존 105개를 같은 묶음으로 실행했다.

첫 검증의 실패는 기존 API 테스트가 루트 모듈에 HealthModule만 있다고 가정한 것이다. 해당 연결 검사만 AuthModule·공유 DB 구조로 갱신하고 기존 HTTP 행동 검사는 정확한 비교로 보존했다. 컨테이너 검사 명령의 PowerShell 인수 인용·UTF-16 로그 처리도 수정한 뒤 전체 묶음을 재실행했다. 운영 Docker 이미지 build와 실제 Argon2 검증/HTTPS Secure 설정 검사도 종료 코드 0이다. 이 컨테이너 검사는 홈서버의 실측 부하 결과가 아니다.

로컬 기본 DB에는 추가 마이그레이션을 적용해 총 업무/환경 테이블 12개를 확인했다. 기존 메타데이터 해시·회사/사용자/세션 수·비밀 환경 파일을 보존했고 기본 DB에 개발 seed 또는 로그인 대역 계정을 생성하지 않았다. 별도 검증 DB는 자신이 생성한 이름만 검사해 정리했다. 전체 작업 체크 ID 139개는 이전과 동일하다.

[검증 결과](../../.artifacts/implementation-f01-auth-session/results.json), [테스트 보고서](../../.artifacts/implementation-f01-auth-session/tests.json), [명령 종료 코드](../../.artifacts/implementation-f01-auth-session/execution.json), [실제 DB 테스트 근거](../../.artifacts/implementation-f01-auth-session/database-evidence.json), [로컬 DB 보존 근거](../../.artifacts/implementation-f01-auth-session/local-database-evidence.json), [컨테이너 명령 종료 코드](../../.artifacts/implementation-f01-auth-session/container-execution.json)를 참조한다. 전체 명령은 `powershell.exe -NoProfile -File .artifacts/implementation-f01-auth-session/run-verification.ps1`이며 문서 최종 반영 검사는 `python .artifacts/implementation-f01-auth-session/verify.py`로 동일한 4개 기준을 다시 확인한다.

Hindsight 예약은 PT30M·Ready이고 원격 문서 일치는 확인하지 않았다. 홈서버 배포·Argon2 홈서버 부하·신뢰 프록시의 실제 IP·이메일 발송·웹 사용자 흐름은 실행하지 않은 후속 검증이다. F01/F08-13 전체 체크는 유지하며 다음 같은 단계 묶음은 가입·이메일 확인·복구 또는 회사 관리 범위를 먼저 제시한다.


회사 기반 후속 상태(2026-10-05): 사용자가 [세 번째 서버 설계](01-company-foundation-design.md)를 지정해 “OK”로 승인했다. 이번 범위의 여섯 선택·14개 파일·8개 검증 조건을 확정해 세 번째 서버 부분을 구현·검증했다. 전체 테스트 239개와 8개 완료 조건 모두 PASS다. 첫 인증 검증 144개와 두 번째 검증 190개는 당시의 기록이며 현재 회사 기능 검증을 대신하지 않는다.
