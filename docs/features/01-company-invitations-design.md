# F01·F08-13 다섯 번째 묶음: 관리자 초대·세무사 접근 요청 서버

[문서 인덱스](../README.md) · [회사와 사용자 권한](01-company-access.md) · [직전 구성원 서버](01-company-members-design.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **다섯 번째 서버 묶음 구현·검증 완료**. 작성/확정일: 2026-10-05. 확정 근거: 사용자가 이 설계 문서를 지정해 “ok”로 동의했다. 영향 ID: F01-02·F01-05·F01-08·F08-13의 서버 부분. 아래 여덟 선택·14개 구현 파일·11개 API·8개 검증 조건을 구현·검증했다. 중첩 입력과 공통 초기화의 두 수리 재개는 각 명시적 “OK”와 아래 승인 기록을 따른다. 전체 F01/F08-13·실제 웹 화면·운영 배포 완료와 구분한다.

## 작업 ID와 선행 근거

P-01·P-02·P-03·P-04·P-10과 F08-10·F08-11·F08-12의 완료 기록을 재사용한다. 직전 구성원 서버의 [8개 PASS 결과](../../.artifacts/implementation-f01-company-members/results.json)와 [284개 테스트 보고서](../../.artifacts/implementation-f01-company-members/tests.json)를 확인한다. 같은 F01 단계에서 구성원 관리 → 초대·접근 요청 → 남은 회사 설정·화면 순서는 이미 확정했다. 상위 F01·F08-13 → F13-01~03 → 업무 화면 순서와 전체 F01/F08-13 체크는 유지한다.

이번 작업은 두 경로를 통한 **새 회사 소속 부여**를 연결하는 서버 묶음이다. 업무 전표·증빙·재무제표 접근, 실제 웹 화면·운영 SMTP/홈서버 배포는 포함하지 않는다. 기존 사용자의 전역 중지·이메일 변경·중지 소속 재활성화·회사 본인 승인 설정도 제외한다.

## 기존 확정 정책과 현재 코드

정책 원문은 [AUTH-01·07·08·09·10](01-company-access.md#사용자-위임으로-확정한-인증-기본-정책)과 [외부 세무사 회사 접근](01-company-access.md#확정한-외부-세무사-회사-접근)을 따른다. 아래 항목을 다시 결정하지 않는다.

- 관리자 초대와 세무사 요청 후 관리자 승인 두 경로를 모두 지원한다. 가입·요청만으로 회사 권한은 생기지 않는다.
- 초대·접근 요청은 7일 만료다. 확인된 지정 이메일 계정만 초대를 수락한다. 재발송 시 이전 링크는 무효화한다.
- 회사·대상별 대기 초대와 대기 요청은 각각 1개다. 관리자는 초대 취소/재발송, 요청자는 자기 대기 요청 취소, 관리자는 승인/반려한다. 만료·취소·반려 후 새로 제출할 수 있다.
- 처리 시점에도 현재 관리자 권한과 대상 계정 상태를 검사한다. 역할/소속 변경은 회사에만 적용하며 감사에 처리자·회사·시각·변경 내용을 남긴다.
- 운영 쿠키·Origin/CSRF, 최근 5분 재확인과 초기 8시간 절대 만료를 유지한다. 변경 가능한 설정은 공통 설정 파일에 한 번 정의한다.

승인 범위의 초대/접근 요청 모델·API·토큰 및 검증 코드를 구현하고 API 행동·로컬 Mailpit 발송·세션/감사/DB rollback을 검증했다. 전체 347개 테스트와 여덟 조건이 통과했다. 첫 TypeScript 빌드 실패와 다음 공통 초기화 실패, 각 수리 승인·재검증의 이력은 아래에 보존한다. [구성원 서비스](../../server/src/companies/company-members.service.ts)는 기존 소속의 역할 교체/중지만 수행한다. [세션 서비스](../../server/src/auth/session.service.ts)는 본인 식별자/CSRF 교체·대상 세션 폐기를 제공한다. [공통 설정](../../server/src/config/app.config.ts)에 초대/요청 7일 값과 요청 한도를 추가했다. [메일 서비스](../../server/src/mail/mail.service.ts)와 텍스트 서식을 재사용하고 AuthModule의 MailService를 CompaniesModule에 공유하도록 export한다. 기존 가입·복구 토큰과 초대 토큰을 혼용하지 않는다.

## 이번 범위의 사용자 확정값 8개

아래는 **2026-10-05 사용자가 이 문서를 지정해 “ok”로 확정한 값**이다. 기존 AUTH 정책 10행은 수정하지 않는다.

| 확정한 사항 | 사용자 확정값 | 적용 영향 |
| --- | --- | --- |
| 요청할 회사 식별 | 회사 관리자가 전달한 companyId로 신청. 서비스 전체 회사 검색/디렉터리와 공개 회사 상세 API는 만들지 않음 | 요청자는 회사 UUID를 알아야 한다. 존재하지 않는 회사는 404이며 소속 승인 전 회사 업무 자료는 조회할 수 없음 |
| 기존 소속 처리 | 활성 소속이 있으면 409, 중지 소속도 409. 초대/승인으로 기존 역할을 합치거나 중지 소속을 되살리지 않음 | 역할 변경은 기존 구성원 API로 처리. 재활성화는 별도 설계가 필요 |
| 대기 중복과 수정 경합 | 같은 대상에 초대와 요청이 동시에 대기하지 않게 함. 같은 종류·동일 입력의 반복 제출은 기존 대기 건 반환, 다른 역할 입력은 409. 각 건에 양의 version을 두고 실제 상태/재발송 때만 증가 | 반대 경로가 대기 중이면 먼저 취소/반려/만료해야 한다. 오래된 version·이미 끝난 처리는 409. 토큰 재사용은 같은 일반 400 |
| 새 소속 부여 시 세션 | 본인 초대 수락은 현재 식별자/CSRF 교체·다른 기기 폐기·초기 절대 만료 보존. 관리자 요청 승인은 대상의 기존 세션 모두 폐기 | 승인 대상은 다시 로그인한다. 다른 회사 소속/역할은 보존하며 다른 회사 탭의 로그인은 끊길 수 있음 |
| 5분 재확인 범위 | 관리자 초대 생성/재발송/취소·요청 승인/반려와 본인 초대 수락에 요구. 요청 제출·본인 취소는 유효 로그인과 Origin/CSRF만 요구 | 실제 역할 부여/관리 작업 전에 기존 비밀번호 재확인 API 사용. GET은 재확인/활동 연장 없음 |
| 초대 발송·실패 처리 | 기존 Nodemailer/로컬 Mailpit과 commit 후 비동기 전송. 현재 발송 토큰의 해시를 실패 시 무효화하고 대기 상태는 재발송 가능하게 유지 | DB 접수와 실제 배달은 다르다. 예전 메일 실패가 새 재발송 토큰을 취소하지 않음. 영속 메일 큐는 이번에 추가하지 않음 |
| 발송/요청 제한 | 초대 생성/재발송은 기존 이메일 확인·복구의 대상 이메일/IP 버킷과 15분당 3회/20회를 합산. 접근 요청은 별도 요청자/IP 버킷으로 같은 15분당 3회/20회 | 수치는 프로젝트 추천값이다. 인증·엄격한 입력 검증 후 서비스에서 예약하며 잘못된 스키마까지 세는 전역 IP 제한은 이번 범위가 아님. 시간/한도는 공통 설정에서 참조 |
| 수락 시 초대 발행자 권한 | 수락 때 마지막 발행/재발송 관리자의 현재 계정·활성 소속·관리 권한도 재검사. 발행자가 권한을 잃었으면 409 | 남은 관리자가 재발송하면 발행자와 링크를 교체하여 진행 가능. 과거 권한만으로 새 소속을 부여하지 않음 |

초대는 관리자가 지정한 다섯 역할 중 중복 없는 1~5개 전체 집합을 저장한다. 요청자는 역할을 입력하지 않으며 승인 결과는 **EXTERNAL_TAX 단일 역할**이다. 활성·이메일 확인된 본인 계정만 요청/수락할 수 있다. 아직 가입하지 않은 이메일도 초대할 수 있지만 가입·이메일 확인·로그인은 별도 기존 흐름을 거쳐야 한다. 초대 수락이 이메일 확인이나 비밀번호 설정을 대신하지 않는다.

## 확정 API 계약 11개

모든 경로는 인증된 사용자에게만 제공한다. 관리 경로에만 `company.members.manage`를 선언하고 요청자/수락 경로는 현재 회사 소속을 요구하지 않는다. controller 전체에 회사 관리 권한을 붙여 가입 예정 사용자를 막지 않는다. 쓰기는 Origin/CSRF·UserActivity, 위 선택안의 민감 경로는 5분 재확인을 적용한다. GET은 읽기 전용이며 응답은 no-store다.

| 메서드·경로 | 입력/권한 | 결과 |
| --- | --- | --- |
| GET `/api/companies/:companyId/invitations` | 현재 관리자, cursor/limit | 해당 회사 초대 목록·상태/version, 원문 토큰/해시 제외 |
| POST `/api/companies/:companyId/invitations` | 관리자·5분, email/roles | 새 대기 초대 접수 또는 동일 대기 건. 계정 존재/가입 여부를 출력하지 않음 |
| POST `/api/companies/:companyId/invitations/:invitationId/cancel` | 관리자·5분, version | 대기 초대 취소·토큰 무효화 |
| POST `/api/companies/:companyId/invitations/:invitationId/resend` | 관리자·5분, version | 미수락 대기 초대의 새 7일 링크·발행자 교체, 이전 링크 무효화 |
| POST `/api/company-invitations/accept` | 확인된 본인·5분, token | 이메일·발행자 재검사 후 신규 소속/역할·토큰 소비·본인 세션 교체 |
| POST `/api/companies/:companyId/access-requests` | 확인된 요청자, 빈 strict 본문 | 본인 EXTERNAL_TAX 요청 접수. 동일 대기 요청은 기존 건 반환 |
| GET `/api/me/company-access-requests` | 본인, cursor/limit | 본인 요청만 조회, 다른 요청자·회사 구성원 자료 제외 |
| POST `/api/me/company-access-requests/:accessRequestId/cancel` | 요청자 본인, version | 본인 대기 요청 취소. 다른 사람 ID/없는 ID는 같은 404 |
| GET `/api/companies/:companyId/access-requests` | 현재 관리자, cursor/limit | 해당 회사 요청 목록·최소 요청자·상태/version |
| POST `/api/companies/:companyId/access-requests/:accessRequestId/approve` | 관리자·5분, version | 확인된 활성 요청자에게 새 활성 소속/EXTERNAL_TAX·대상 세션 폐기 |
| POST `/api/companies/:companyId/access-requests/:accessRequestId/reject` | 관리자·5분, version | 대기 요청 반려. 자유 서술 사유는 이번 입력에서 제외 |

UUID·cursor는 기존 회사 스키마와 소문자 정규화를 재사용하고 cursor는 같은 회사/본인 목록 범위여야 한다. 한도는 기존 중앙 25/100이다. token은 기존 난수 형식과 같은 32바이트 난수의 소문자 hex 64자지만 별도 초대 해시 저장소에서만 찾는다. roles는 알려진 enum 집합, version은 양의 INTEGER이며 임의 companyId/userId/active/status/역할 필드는 strict 본문에서 거부한다.

초대 응답은 id/companyId/email/roles/상태/기한/version/발행자 최소 ID만, 요청 응답은 id/companyId/요청자 최소 ID·허용된 이메일/상태/기한/version만 구성한다. 관리자 목록에는 확인/중지 표시를 필요한 범위에서 추가하고 자기 요청 목록에서 회사 이름/회사 업무 자료를 노출하지 않는다. 초대 수락에서만 본인의 최소 세션 응답과 새 HttpOnly 쿠키를 반환한다. 일반 접수 성공은 SMTP 배달 확인이 아니다. 상태 전환 성공은 저장한 건을 반환하며 빈 본문 신청도 추가 필드를 허용하지 않는다.

오류: 400 입력/cursor 및 잘못된·소비된·만료된·이메일 불일치 초대 토큰, 401 현재 인증/세션, 403 현재 관리자·5분 재확인/Origin/CSRF, 404 회사 없음·회사 밖 관리자 대상/다른 사람 자기 요청, 409 기존 소속·반대 경로 대기·version·종료 상태·계정/발행자 상태 변경, 429 발송/신청 제한. 원문 토큰을 URL 경로나 쿼리·JSON 응답·감사·로그에 넣지 않는다. 초대 토큰 오류는 동일한 공통 오류로 반환한다.

## 데이터·상태와 실패 흐름

- 모델 2개를 제안한다. CompanyInvitation은 회사/정규화 대상 이메일/표시 이메일/역할 배열/최종 발행자/상태/version/생성·갱신·기한·처리 시각/일회용 tokenHash와 토큰 무효화 표시를 저장한다. CompanyAccessRequest는 회사/요청자/상태/version/생성·갱신·기한·처리 시각/처리자 ID를 저장한다. 관계 FK는 Restrict로 기존 회사/사용자/감사를 삭제하지 않는다. 새로운 계정이나 임시 소속을 초대 생성 시 만들지 않는다.
- 초대 상태는 PENDING/ACCEPTED/CANCELLED/EXPIRED, 요청 상태는 PENDING/APPROVED/REJECTED/CANCELLED/EXPIRED로 제한한다. version 양수·시각 일관성·초대 역할 enum/개수/중복·토큰 해시 형식/유일성을 SQL CHECK/FK/인덱스로 검증한다. 현재 13개 모델/업무 테이블에 2개를 추가하므로 승인 후 목표는 15개 모델·마이그레이션 7개다. 기존 6개 SQL은 수정하지 않는다.
- PENDING의 회사+대상별 부분 유일 인덱스로 각 경로 중복을 막는다. 현재 시각을 인덱스 조건으로 넣지 않는다. 만료는 `expiresAt <= 서버 현재 시각`으로 판단하고 GET은 저장하지 않는다. 목록 응답에서는 기한이 지난 PENDING을 EXPIRED로 표시하되 저장 상태/version은 변경하지 않는다. 후속 쓰기에서 같은 대상의 만료 대기 건을 EXPIRED/version+1/고정 감사로 함께 정리한 후 신규 건을 만들 수 있다. 유효하지 않은 토큰 수락은 400으로 끝나고 GET이나 실패 요청이 상태를 고쳤다고 가정하지 않는다.
- 초대 재발송은 7일이 지나 EXPIRED인 옛 건을 되살리는 API가 아니다. 아직 만료 전 미수락 PENDING만 새 토큰/7일/version/현재 발행자로 교체한다. 만료된 건은 새 초대 생성으로 처리한다. SMTP 실패로 토큰이 무효화된 PENDING도 재발송할 수 있다. 메일 실패는 업무 상태 전환과 별도 감사로 기록하며 새 토큰/이미 수락한 건을 건드리지 않는다.
- User 잠금은 처리자/대상/필요한 초대 발행자의 UUID 순서 → 현재 처리자 세션 → 회사 → 초대/요청 순서다. 본인 수락도 같은 순서로 잠근다. 잠금 후보 조회는 사전 수집이며 회사 잠금 뒤 이메일 대상/발행자가 달라져 잠그지 않은 User가 필요하면 409로 전체 취소한다. 회사 잠금 아래 현재 권한·계정·소속 없음·기한·version/토큰 해시·동일/반대 대기 상태를 다시 검사한다. 잠근 뒤 새 User를 역순으로 잠그지 않는다.
- 새 소속 부여는 기존 CompanyMembership과 CompanyMemberRole의 회사+사용자 유일성 및 복합 회사 FK를 사용한다. 새 소속 version은 1이다. Company.version과 기존 다른 회사 소속/역할은 변경하지 않는다. 승인은 EXTERNAL_TAX만, 수락은 저장된 초대 역할만 부여하며 요청자가 전송한 역할을 쓰지 않는다. 종료 상태·소비 토큰을 반복 호출해 소속/권한/세션을 다시 만들지 않는다.
- 부여/상태/version/토큰 소비/세션/고정 성공 감사는 한 트랜잭션이다. 감사·세션·제약 실패는 모두 rollback하며 commit 전 쿠키를 교체하지 않는다. 이메일 한도 예약과 기존 guard의 활동 연장은 이 업무 트랜잭션과 별도 계약이다. 권한 부여에서 기존 잠금 규칙을 지켜 직전 관리자 변경과 경합하도록 한다.
- 고정 감사는 INVITATION_CREATED, INVITATION_CANCELLED, INVITATION_RESENT, INVITATION_ACCEPTED, INVITATION_MAIL_FAILED, ACCESS_REQUEST_CREATED, ACCESS_REQUEST_CANCELLED, ACCESS_REQUEST_APPROVED, ACCESS_REQUEST_REJECTED, COMPANY_ACCESS_EXPIRED 10개를 제안한다. DB 허용 목록과 AuditService의 사건별 허용 필드를 함께 추가한다. 대상 건/사용자 ID·역할·전후 상태/version·기한·세션 폐기 수만 명시적으로 구성하며 이메일·tokenHash·원문 토큰·메일 본문·임의 details는 복사하지 않는다.
- 메일은 검증한 웹 Origin의 `/accept-company-invitation#token=...` 텍스트 링크로만 전달한다. 기존 메일 설정/라이브러리/환경 파일은 보존한다. 화면은 후속 구현이므로 이번에는 Mailpit 캡처 링크의 토큰을 테스트가 POST로 소비한다. 전송 pending 작업은 정상 종료 시 기다리고 강제 종료 후에는 관리자 재발송으로 복구한다. 영속 큐·전달 보장은 구현하지 않는다.

## 수정·생성할 구현 파일 14개

최초 수정 대상은 **`server/src/config/app.config.ts`**였다. IDE에서 먼저 열고 중앙 7일 만료와 요청 제한 값·기존 설정 재사용을 설명한 뒤 14개 파일을 작성했다. 현재 컴파일 실패이며 검증 체크는 완료하지 않는다. 아래 8개 수정/6개 생성은 이번 사용자 확정 범위이며 아래 8개 검증을 묶어서 실행한 뒤 완료 처리한다.

| 구분 | 경로 | 목적과 구체적인 변경 |
| --- | --- | --- |
| 수정 | `server/src/config/app.config.ts` | 초대/요청 7일 만료·요청 버킷 설정을 중앙 정의, 기존 발송/재확인/목록 정책 참조 |
| 수정 | `server/prisma/schema.prisma` | 초대/요청 모델 2개와 Company/User 역관계, 기존 13개 모델 보존 |
| 생성 | `server/prisma/migrations/20261005060000_company_access_flows/migration.sql` | 새 테이블·FK·상태/version/역할 CHECK·대기 유일 인덱스·감사 사건 추가, 기존 6개 SQL 보존 |
| 수정 | `server/src/auth/auth.module.ts` | 이미 제공하는 MailService를 export하여 같은 SMTP 전송자 공유, 기존 guard/인증 동작 유지 |
| 수정 | `server/src/companies/companies.module.ts` | 새 controller/service를 기존 Auth/DB 모듈에 연결, MailService 중복 생성 없이 주입 |
| 생성 | `server/src/companies/company-access-flows.schemas.ts` | 초대 email/roles·버전·초대 token·빈 신청 본문·회사/본인 cursor의 엄격한 입력 |
| 생성 | `server/src/companies/company-access-flows.controller.ts` | API 11개, 메서드별 관리자/본인·재확인/활동 선언, 수락 commit 후 본인 쿠키 |
| 생성 | `server/src/companies/company-access-flows.service.ts` | 상태 머신·중복/만료·순서 잠금·최신 권한·신규 소속/세션/감사·발송/신청 한도·메일 실패 처리 |
| 수정 | `server/src/audit/audit.service.ts` | 고정 사건 10개·허용 상태/역할/ID/version 필드만 구성, 기존 17개 사건 유지 |
| 수정 | `server/src/mail/mail.templates.ts` | 지정 이메일 초대 텍스트·중앙 7일 안내·fragment 링크, 기존 확인/복구 서식 유지 |
| 생성 | `server/tests/company-access-flows.test.ts` | 자체 DB/실제 HTTP/Mailpit로 신청→승인/초대→수락·경합·메일 실패·세션/감사 rollback 검증 |
| 생성 | `server/tests/company-access-flows-validation.test.ts` | 설정과 엄격한 스키마·역할/UUID/token/version/빈 본문/목록·메일 서식 경계 |
| 수정 | `server/tests/database-foundation.test.ts` | 모델 15개/마이그레이션 7개·새 제약·기존 6개 SQL 자료 업그레이드 보존, 자체 DB만 제거 |
| 수정 | `server/tests/audit.test.ts` | 새 사건/종류 일치·허용 필드와 이메일/해시/원문 미노출, 기존 감사 계약 유지 |

`company-members.service.ts`·기존 로그인/가입/복구/세션/공통 guard·상위 AppModule·메일 transport/패키지/실제 환경·인프라는 수정하지 않는다. 변경이 더 필요하면 이유와 파일을 제시하고 추가 범위를 확인한다. 새 코드의 변경 영역·입출력·서비스/DB 상태 차이·잠금 순서·메일/권한 부여의 실패 흐름을 상세 주석으로 설명한다.

## 구현 후 묶어서 검증할 조건 8개

- [x] 관리자만 자기 회사 초대/요청을 조회·처리하고 요청자는 자기 건만 조회/취소한다. 소속 없는 확인 계정의 요청/수락과 다른 회사·cursor·타인 ID 차단을 확인한다.
- [x] 지정 이메일 확인·초대 역할 전체 집합·EXTERNAL_TAX 승인 고정·strict 입력·미가입 초대와 가입/확인 분리·토큰/해시 미노출을 확인한다.
- [x] 7일 정확한 만료·재발송 구 링크 무효·취소/반려/만료 후 신규 건·동일 입력 중복·반대 경로/기존 소속·종료 상태/version 경계를 확인한다.
- [x] 순서 잠금 뒤 처리자/발행자/요청자 계정·현재 역할/세션/5분·기한/version을 다시 검사하고 동시 수락/승인/취소/재발송에서 소속 부여가 한 번만 일어난다.
- [x] 본인 수락 식별자/CSRF 교체·초기 절대 만료 보존·다른 기기 폐기와 관리자 승인 대상 전체 세션 폐기·다른 회사 역할/자료 보존을 실제 HTTP로 확인한다.
- [x] 새 소속/역할·초대/요청 상태/version/토큰·세션·고정 감사의 원자성, 감사/세션/DB 실패 rollback과 commit 전 쿠키 미변경을 확인한다.
- [x] Mailpit 캡처·전송 실패/구 발송 실패와 새 토큰 경합·메일/신청 한도·로그/감사 비밀 미노출·Origin/CSRF/GET 읽기 전용·활동 경계를 확인한다.
- [x] 기존 284개 포함 전체 서버 테스트·schema/타입/build/컨테이너·로컬 추가 마이그레이션·기존 자료/환경/정책 보존을 한 묶음으로 검증하고 결과가 모두 PASS일 때만 이번 서버 부분 체크를 갱신한다.

위 체크는 아래 전체 실행 증거로 충족한 이번 서버 부분의 완료 조건이다. 이전 부분 통과/중단은 역사 기록으로 구분한다. 운영 메일·홈서버·실제 웹 화면과 남은 회사 설정은 검증 범위가 아니며 전체 F01/F08-13 체크는 유지한다.

## 이번 설계 문서의 객관적 검증 조건 3개

1. 선행 완료 8개·직전 완료 결과 8개 PASS/284개 테스트, AUTH-09~10 정책과 새 추천안 8개·제안 API 11개·미실행 체크 8개가 일치한다. 이번 승인 대기와 구현 전 상태를 구분한다.
2. 구현 파일 14개(수정 8/생성 6)·최초 공통 설정의 현재 존재 여부와 순서, 담당 문서 7개의 로컬 링크·제목 참조가 정확하다.
3. 기존 코드/테스트/SQL/실제 환경·보호 문서/직전 증거 해시 95개, AUTH 정책 10행, 계획 ID 139개/상태, 직전 구성원 완료 체크 8개를 보존한다. Hindsight PT30M 예약·현재 상태·마지막 기록을 확인하고 최신 원격 문서 일치는 미확인으로 분리한다.

설계 단계 검증 명령: `python .artifacts/design-f01-company-invitations/verify.py`. 이 명령은 승인/코드 미생성 상태의 역사 기록이다. 현재 구현은 `.artifacts/implementation-f01-company-invitations/verify.py`의 별도 8개 조건으로 검증한다. [검증 결과](../../.artifacts/design-f01-company-invitations/results.json)는 설계 문서의 정확성/보존만 의미하며 초대/요청 구현이나 추천안 확정 근거가 아니다. 승인 후 구현 검증은 별도 작업 단위로 정의한다.


설계 검증 기록(2026-10-05): 위 명령 종료 코드 0, 첫 전체 검증의 세 조건 모두 PASS였다. 선행 완료 8개·직전 8개 PASS/284개 테스트의 기록과 새 추천안 8개·API 11개·미실행 기능 조건 8개를 대조했다. 구현 예정 파일 14개(수정 8/생성 6)의 존재 여부와 첫 설정 파일, 관련 문서 7개의 로컬 링크 366개·제목 참조 104개를 확인했다. 코드/테스트/SQL/환경/직전 증거 등 보호 파일 95개·AUTH 정책 10행·계획 ID 139개/상태·직전 완료 체크 8개를 보존했다. Hindsight는 새로 확인한 PT30M·Ready, 마지막 기록은 2026-10-05 04:35 UTC success다. 이번 변경 문서의 원격 일치는 검사하지 않아 UNVERIFIED이며 예약 실행에 맡긴다. 이 세 PASS는 설계 문서 검증만 뜻하고 초대/요청 코드 구현이나 여덟 추천안의 사용자 확정이 아니다.


## 첫 구현 검증 실패와 수리 중단 기록

2026-10-05: `powershell.exe -NoProfile -File .artifacts/implementation-f01-company-invitations/run-verification.ps1`로 첫 전체 명령 묶음을 실행했다. 명령 실행기의 exit 0은 기록을 끝냈다는 의미이며 빌드/기능 검증 성공이 아니다. [명령 종료 코드](../../.artifacts/implementation-f01-company-invitations/initial-failure/execution.json)의 schema=0·DB 타입=0, 서버 build=2·test=-1이다. [컨테이너 기록](../../.artifacts/implementation-f01-company-invitations/initial-failure/container-execution.json)은 build=1·runtime=-1, [로컬 적용 기록](../../.artifacts/implementation-f01-company-invitations/initial-failure/local-execution.json)은 -1(생략)이다. Vitest는 실행되지 않았고 통과 개수를 새로 주장하지 않는다. 기존 284개는 직전 작업의 역사 기록이다.

가장 앞선 실패 계층은 **새 소속/역할 쓰기와 Prisma가 생성한 중첩 입력 계약의 불일치**다. [회사 접근 서비스](../../server/src/companies/company-access-flows.service.ts)의 승인 분기 249줄에서 TS2353이 발생했다. `CompanyMemberRoleCreateWithoutMembershipInput` 및 unchecked 입력은 `role`만 허용하며 부모 CompanyMembership 관계가 이미 회사/소속 키를 제공한다. 코드가 중첩 `roles.create`에 `companyId`를 직접 넣었다. 수락 분기 211~212줄과 신규 테스트의 같은 작성 패턴도 같은 계약 관점에서 검토해야 한다. 이 설명은 오류 원인/수정 방향이며 수정 완료가 아니다.

[당시 8개 결과](../../.artifacts/implementation-f01-company-invitations/initial-failure/results.json)와 [첫 검증 원본](../../.artifacts/implementation-f01-company-invitations/first-pass-results.json):

| 조건 | 첫 상태 | 근거와 미검증 이유 |
| --- | --- | --- |
| 회사 범위·요청 소유권 | UNVERIFIED | build exit 2로 Vitest 생략(test=-1) |
| 입력·이메일·역할·토큰 | UNVERIFIED | build exit 2로 Vitest 생략(test=-1) |
| 만료·중복·version·기존 소속 | UNVERIFIED | build exit 2로 Vitest 생략(test=-1) |
| 잠금 뒤 처리자/발행자/대상·동시 처리 | UNVERIFIED | build exit 2로 Vitest 생략(test=-1) |
| 세션 교체/폐기·다른 회사 보존 | UNVERIFIED | build exit 2로 Vitest 생략(test=-1) |
| 감사/세션/DB 원자성·쿠키 | UNVERIFIED | build exit 2로 Vitest 생략(test=-1) |
| 메일·제한·실패 경합·HTTP 보호 | UNVERIFIED | build exit 2로 Vitest 생략(test=-1) |
| 전체 테스트/build/runtime/업그레이드·문서 보존 | FAIL | 서버 TS2353/build=2, 같은 오류로 컨테이너 build=1. runtime/기능 테스트/로컬 적용 생략 |

첫 검증의 FAIL+UNVERIFIED 합은 **8개**다. [AGENTS.md 완료 기준](../../AGENTS.md)의 “첫 검증에서 FAIL과 UNVERIFIED의 합이 2개를 넘으면 수리를 멈추고” 지침을 적용해 코드를 더 수정하지 않았다. 전체 기능/실제 화면·메일·홈서버 및 이번 서버 묶음 모두 완료로 보고하지 않는다. 이 문서의 8개 미실행 체크와 상위 F01/F08-13 체크는 미완료 상태를 유지한다.

[읽기 전용 로컬 DB 확인](../../.artifacts/implementation-f01-company-invitations/local-read-evidence.json): 기본 DB는 기존 업무 테이블 **13개·마이그레이션 6개**이며 새 초대/요청 테이블을 적용하지 않았다. 기본 DB에 seed·시험 자료를 만들지 않았다. [보존 확인](../../.artifacts/implementation-f01-company-invitations/preservation-evidence.json): 보호 파일 87개·계획 ID/상태 139개·AUTH 정책 10행을 보존했다. 승인받아 수정한 파일은 보존 해시 비교 대상에서 제외하고 수리 중단 시점의 별도 코드 해시로 보관했다. Hindsight는 30분 예약을 유지하며 최신 변경 문서의 원격 일치는 UNVERIFIED다.


## 근본 원인 수리 재개 승인

2026-10-05: “이번 근본 원인 수정에 한해 수리 중단을 해제하고, 두 파일 수정 후 전체 검증을 다시 실행할까요?”라는 구체적 질문에 사용자가 `company-access-flows.service.ts`를 지정해 “OK”로 동의했다. 이번 예외는 서비스와 통합 테스트의 중첩 역할 입력 4곳을 Prisma 생성 계약에 맞추는 수정 및 전체 검증 재실행에만 적용한다. 기존 여덟 업무 선택·14개 구현 파일·상위 순서·정책값은 바꾸지 않는다. 아직 기능 완료가 아니다. 최초 실패/중단 기록과 승인 근거를 보존하며 재개 첫 검증도 동일한 8개 조건으로 집계한다. 새 첫 검증에 미통과가 2개를 넘으면 다시 수리를 중단한다.

## 재개 검증 실패와 공통 테스트 초기화 원인

2026-10-05: 승인한 2개 파일의 중첩 `roles.create` 입력 4곳만 수정했다. [서비스 수락 분기](../../server/src/companies/company-access-flows.service.ts)의 214줄은 `roles: { create: before.roles.map(role => ({ role })) }`, 승인 분기 252줄은 `roles: { create: { role: 'EXTERNAL_TAX' } }`이다. 부모 소속 생성이 회사·소속 외래 키를 제공하므로 하위 입력은 역할만 전달한다. 역할 선택·승인 정책은 유지한다. [통합 테스트](../../server/tests/company-access-flows.test.ts)의 356·468줄도 같은 입력 계약을 따른다. 각 수정 앞의 상세 주석에 부모 관계와 하위 입력의 역할을 설명했다. [수리 승인 범위](../../.artifacts/implementation-f01-company-invitations/repair-approval.json)를 참조한다.

동일한 `run-verification.ps1`로 전체 묶음을 다시 실행했다. [명령 결과](../../.artifacts/implementation-f01-company-invitations/resumed-pass-1/execution.json)는 schema=0·build=0·DB 타입=0·test=1이고, [컨테이너 결과](../../.artifacts/implementation-f01-company-invitations/resumed-pass-1/container-execution.json)는 build=0·runtime=0이다. 따라서 원래 TS2353 오류는 해결됐다. 컨테이너 runtime 검사는 Argon2·설정 검사이며 실제 운영 DB 연결이나 배포 검사가 아니다.

[전체 테스트 보고서](../../.artifacts/implementation-f01-company-invitations/resumed-pass-1/tests.json)는 **347개 중 314개 통과·33개 실패**다. 기존 284개와 신규 HTTP 4개·입력/설정/메일 서식 23개·DB 2개·감사 1개가 통과했다. 33개는 모두 같은 테스트 파일의 공통 `beforeEach`에서 실패하여 각 업무 본문을 실행하지 못했다. 이를 33개의 업무 기능 결함으로 해석하지 않는다.

가장 앞선 실패 계층은 **테스트 데이터 초기화**다. `company-access-flows.test.ts:196`의 경합 검사가 비밀번호 없는 중지 임시 계정을 만든 뒤, 다음 테스트의 137줄 `db.user.updateMany({ data: { disabledAt: null, emailVerifiedAt: baseTime } })`가 모든 계정을 활성화한다. 임시 계정도 포함되어 기존 `users_active_password` CHECK를 위반한다. [원인 대조 기록](../../.artifacts/implementation-f01-company-invitations/resumed-diagnosis.json)은 33개 실패 메시지 모두 `db.user.updateMany`와 해당 제약을 포함하는지 확인한 결과다. DB 제약을 완화하거나 33개 테스트를 개별 수정하지 않는다.

[재개 첫 검증 원본](../../.artifacts/implementation-f01-company-invitations/resumed-first-pass-results.json)과 [당시 8개 결과](../../.artifacts/implementation-f01-company-invitations/resumed-pass-1/results.json):

| 조건 | 재개 첫 상태 | 근거와 미검증 이유 |
| --- | --- | --- |
| 회사 범위·요청 소유권 | UNVERIFIED | 공통 beforeEach 실패로 필수 HTTP 행동 미실행 |
| 입력·이메일·역할·토큰 | UNVERIFIED | 입력 23개 통과, 필수 이메일/역할 부여 HTTP 행동은 초기화에 막힘 |
| 만료·중복·version·기존 소속 | UNVERIFIED | 취소/version 행동은 통과, 나머지 필수 행동 미실행 |
| 잠금 뒤 처리자/발행자/대상·동시 처리 | UNVERIFIED | 재발송/수락 경합·신규 계정 후보 재검사는 통과, 나머지 필수 행동 미실행 |
| 세션 교체/폐기·다른 회사 보존 | UNVERIFIED | 공통 beforeEach 실패로 필수 HTTP 행동 미실행 |
| 감사/세션/DB 원자성·쿠키 | UNVERIFIED | 감사 단위 검사 통과, HTTP rollback/쿠키 행동은 초기화에 막힘 |
| 메일·제한·실패 경합·HTTP 보호 | UNVERIFIED | 일부 Mailpit 사용, 필수 실패/한도/보호 행동은 초기화에 막힘 |
| 전체 테스트/build/runtime/업그레이드·문서 보존 | FAIL | 테스트 exit 1, 33개 실패; 로컬 추가 마이그레이션 생략 |

재개 첫 검증도 FAIL+UNVERIFIED가 **8개**다. 이번 예외는 중첩 입력 계약 수정에 한정되므로 [AGENTS.md 완료 기준](../../AGENTS.md)에 따라 다시 수리를 중단한다. 8개 기능 체크와 상위 F01/F08-13 체크는 미완료로 유지한다. [자체 검증 DB 증거](../../.artifacts/implementation-f01-company-invitations/resumed-pass-1/database-evidence.json)는 원래 메타데이터 보존과 자체 생성 DB만 제거했음을 확인한다. [읽기 전용 재확인](../../.artifacts/implementation-f01-company-invitations/local-read-evidence.json)의 기본 DB는 여전히 업무 테이블 13개·마이그레이션 6개이며 새 SQL을 적용하지 않았다. 보호 파일 87개·이번 수리 대상 외 구현 파일 12개·AUTH 정책 10행·계획 ID/상태 139개를 보존한다.

다음 수정안은 **통합 테스트 한 파일의 137줄 초기화 대상을 비밀번호를 갖고 만든 기본 계정 userA/userB/userC의 ID 3개로 제한**하는 것이다. 임시 중지 계정은 의도한 상태를 유지한다. 이 제안은 아직 구현하지 않았으며 해당 원인의 수리에 한한 중단 해제 확인이 필요하다. 승인 시 주석과 해당 초기화만 수정한 뒤 기존 8개 조건의 전체 묶음을 다시 실행한다.

실패 기록 문서의 별도 검증 조건은 1개였다: 실행 보고서/8개 상태/원인 위치·7개 담당 문서 링크/제목·보호 해시/정책/기존 체크·읽기 전용 DB 상태·Hindsight PT30M 예약을 실제 근거와 대조했다. 당시 명령 `python .artifacts/implementation-f01-company-invitations/verify-resumed-record.py`의 exit 0과 [보존한 결과](../../.artifacts/implementation-f01-company-invitations/resumed-pass-1/resumed-record-results.json)는 중단 시점 기록의 정확성만 뜻한다. 이후 코드/DB 상태와 현재의 전체 구현 검증은 다음 기록을 따른다. Hindsight 최신 문서 원격 일치, 실제 화면·운영 메일·홈서버 배포는 검증하지 않았다.

## 공통 초기화 수리 재개 승인

2026-10-05: “테스트 한 파일의 초기화 대상을 기본 계정 3개로 제한하는 수정에 한해 중단을 해제하고, 전체 검증을 다시 실행할까요?”라는 질문에 사용자가 `company-access-flows.test.ts`를 지정해 “OK”로 동의했다. 영향 ID는 F01-02·F01-05·F01-08·F08-13의 이번 서버 부분이다. 이번 예외는 공통 계정 초기화의 where 조건과 설명 주석 수정에만 적용한다. 기본 계정 userA/userB/userC의 ID만 초기화하여 비밀번호 없는 임시 중지 계정을 보존한다. 업무 서비스·DB 제약·기존 선택과 상위 순서는 변경하지 않는다. [승인 범위와 보존 해시](../../.artifacts/implementation-f01-company-invitations/fixture-repair-approval.json)를 참조한다.

검증 조건은 기존 여덟 조건을 그대로 사용한다. 여덟 번째 조건에 이번 코드 변경이 승인한 초기화/주석에만 한정되는지와 나머지 구현 파일 13개의 해시 보존을 포함한다. 전체 테스트·schema/build/DB 타입·컨테이너·성공 후 로컬 추가 마이그레이션/자료 보존을 같은 묶음으로 실행한다. 재개 첫 검증에 미통과가 2개를 넘으면 다시 수리를 중단한다. 이전 실패 원본/수리 중단 코드와 문서 검증 기록은 `resumed-pass-1`에 보존한다.

## 실제 실행 검증 기록

2026-10-05: 승인한 [통합 테스트](../../server/tests/company-access-flows.test.ts)의 공통 초기화 140줄에 `where: { id: { in: [userA.id, userB.id, userC.id] } }`를 추가했다. 137~139줄의 상세 주석은 기본 계정만 복원하는 이유와 임시 중지 계정/비밀번호 제약 보존을 설명한다. 이 수리에서 그 밖의 실행 코드는 바꾸지 않았으며 [승인 전 원본](../../.artifacts/implementation-f01-company-invitations/fixture-source-before.ts.txt)과 정확하게 대조했다. 앞선 중첩 입력 수리의 테스트 위치는 주석 추가 후 359·471줄이며 서비스 위치 214·252줄은 같다.

`powershell.exe -NoProfile -File .artifacts/implementation-f01-company-invitations/run-verification.ps1`로 전체 묶음을 재실행했다. 전체 **347개/347개 PASS**다. 기존 284개에 이번 HTTP/DB 행동 37개·입력/설정/메일 서식 23개·DB 업그레이드/제약 2개·감사 1개를 추가했다. schema/build/DB 타입/test·컨테이너 build/runtime·로컬 추가 마이그레이션의 각 종료 코드는 0이다. 컨테이너 runtime은 Argon2·Secure 쿠키 설정·SMTP/회사 모듈/입력 검사를 의미하며 홈서버 배포를 뜻하지 않는다.

[전체 테스트 보고서](../../.artifacts/implementation-f01-company-invitations/tests.json), [HTTP/DB 행동 증거](../../.artifacts/implementation-f01-company-invitations/database-evidence.json), [이번 초기화 수리의 첫 전체 검증 결과](../../.artifacts/implementation-f01-company-invitations/fixture-first-pass-results.json), [최종 여덟 조건 결과](../../.artifacts/implementation-f01-company-invitations/results.json)를 보존한다. `python .artifacts/implementation-f01-company-invitations/verify.py`에서 여덟 조건 모두 PASS를 확인한 뒤 위 기능 체크만 갱신했다. 최종 문서/체크 반영은 `python .artifacts/implementation-f01-company-invitations/verify.py --final`로 같은 전체 조건과 함께 대조한다. 추가 코드 수리나 개별 테스트 재실행은 없었다.

| 조건 | 최종 상태 | 객관적 증거 |
| --- | --- | --- |
| 회사 범위·요청 소유권 | PASS | requestOwnershipAndNoPrematureGrant/scopeAndForeignIds/flowPagination=true |
| 입력·이메일·역할·토큰 | PASS | strictFlowInput/tokenIsolationAndEmailMatch/mailCaptureAndRoleGrant/approvalSessionAndFixedRole=true, 입력 23개 통과 |
| 만료·중복·version·기존 소속 | PASS | invitationExpiration/requestExpiration/concurrentDeduplication/opposingPendingConflict/existingMembershipNoRevival/flowVersionBoundaries=true |
| 잠금 뒤 처리자/발행자/대상·동시 처리 | PASS | actorTransactionRecheck/issuerCurrentAuthority/targetTransactionRecheck/newUserCandidateRecheck/concurrentRequestTerminal/concurrentTokenConsumption/concurrentResendAccept=true |
| 세션 교체/폐기·다른 회사 보존 | PASS | selfRotationAndCompanyPreservation/approvalSessionAndFixedRole/flowTargetLoginRace=true |
| 감사/세션/DB 원자성·쿠키 | PASS | invitationAuditAndCookieRollback/requestAuditRollback/flowSessionRollback/flowDatabaseRollback=true |
| 메일·제한·실패 경합·HTTP 보호 | PASS | mailFailureRecovery/oldMailFailureRace/sharedEmailAndRequestLimits/flowIpLimits/flowHttpProtectionAndReadOnly=true |
| 전체 테스트/build/runtime/업그레이드·문서 보존 | PASS | 347개 통과, 각 명령 exit 0, 로컬 테이블 15개/마이그레이션 7개, 보호 파일 87개/수리 외 구현 13개·AUTH 10행/상위 체크 139개 보존 |

[로컬 DB 증거](../../.artifacts/implementation-f01-company-invitations/local-database-evidence.json)의 대상은 `127.0.0.1:55432/atms`다. 새 초대/요청 테이블을 추가했으며 기존 메타데이터·회사/기간·소속/역할·사용자/세션 및 실제 환경 파일을 보존했다. 기본 DB 회사/사용자/세션 건수는 0/0/0이고 새 초대/요청도 비어 있으며 seed를 실행하지 않았다. 빈 기본 DB 보존과 구 데이터 보존 검사를 구분한다. 별도 업그레이드 검사는 실제 앞선 6개 SQL로 만든 자료의 모든 기존 테이블 행을 비교하여 일곱 번째 SQL 적용 후 보존과 새 제약을 확인했다. [DB 행동 증거](../../.artifacts/implementation-f01-company-invitations/fixture-pass-1/foundation-database-evidence.json)의 accessUpgradePreservesAllLegacyRows/accessFlowConstraints=true다. 검증용 DB는 자신이 생성한 식별자만 제거했다.

Hindsight는 새로 확인한 PT30M 예약을 유지하며 변경 문서마다 수동 동기화하지 않는다. 마지막 예약 성공 기록과 최신 문서의 원격 일치는 별개다. 이번 최신 원격 일치는 UNVERIFIED다. 실제 웹 화면·회사 본인 승인 설정/재활성화·운영 수신함 배달·홈서버 배포/부하 검증은 남아 있으므로 상위 F01/F08-13 체크는 바꾸지 않는다.

## 사용자가 코드를 이해할 수 있도록 보는 실행 흐름

1. [입력 스키마](../../server/src/companies/company-access-flows.schemas.ts) 9~14줄은 Zod로 허용된 본문만 받는다. 초대는 이메일/알려진 역할 전체 집합, 수락은 64자리 hex 토큰, 변경은 양수 version, 요청 생성은 빈 본문이다. 요청자가 관리자 역할을 보내도 승인 결과는 EXTERNAL_TAX 고정이며 과다 필드는 거부한다.
2. [컨트롤러](../../server/src/companies/company-access-flows.controller.ts) 19~78줄은 API 11개를 기존 인증·회사 권한·입력 검증에 연결한다. 관리자 경로만 회사 관리 권한이 필요하므로 소속 없는 확인 계정도 신청/수락할 수 있다. 변경 요청은 기존 Origin/CSRF를 거치며 관리자 처리/수락에는 최근 5분 재확인이 필요하다. GET은 활동 시간을 연장하지 않는다.
3. [서비스](../../server/src/companies/company-access-flows.service.ts) 63~71줄의 transact는 처리자/대상/발행자 User ID를 정렬해 잠근 뒤 현재 세션과 회사 행을 잠근다. 잠금은 다른 DB 작업이 같은 행의 검사·변경 사이에 끼어들지 못하게 한다. 각 처리 분기는 잠금 뒤 현재 권한·계정·기한/version을 다시 읽는다. 처음 수집한 대상/발행자가 바뀌면 늦게 User 잠금을 추가하지 않고 409로 재조회를 요구한다.
4. 초대 생성 155~178줄은 한도 → 현재 관리자 → 기존 소속/반대 요청/중복 확인 → 토큰 해시와 감사 저장 순서다. commit 이후에만 메일을 보낸다. accepted=true는 서버 접수 결과이며 상대가 수락하거나 메일이 수신함에 도착했다는 의미가 아니다. 미가입 이메일을 초대해도 계정이나 소속을 자동 생성하지 않는다.
5. 수락 196~221줄은 지정 이메일/토큰/발행자 현재 권한을 확인하고 새 소속/초대 역할·종료 상태/토큰 무효·본인 세션 교체·감사를 같은 트랜잭션에서 저장한다. 컨트롤러 40~46줄은 commit 후에만 새 쿠키를 보낸다. 초기 8시간 절대 만료는 보존하며 다른 기기는 폐기한다. 실패하면 부분 소속·쿠키를 남기지 않는다.
6. 요청 생성 222~237줄은 확인된 본인이 알려진 companyId로 PENDING만 만든다. 회사 권한을 즉시 부여하지 않는다. 처리 238~263줄에서 관리자 승인 때만 새 소속과 EXTERNAL_TAX를 생성하고 대상의 기존 세션을 모두 폐기한다. 요청자는 자기 대기 건만 취소하며 관리자는 승인/반려한다. 다른 회사 소속/역할은 유지한다.
7. view/expire/change 분기는 GET의 계산된 EXPIRED 표시와 쓰기 때의 실제 만료 정리를 구분한다. 초대/요청은 7일 경계에서 사용할 수 없고 종료 건 또는 오래된 version은 409다. 재발송은 새 토큰/발행자/version으로 바꾸므로 구 링크는 무효다. 기존 활성/중지 소속은 모두 409이며 역할 병합/재활성화는 수행하지 않는다.
8. dispatch 106~120줄은 Nodemailer를 재사용하고 Mailpit으로 검증했다. 발송 실패는 해당 tokenHash에만 무효화를 적용하므로 늦게 실패한 구 메일이 새 링크를 막지 않는다. 감사·로그에 토큰 원문/해시·이메일을 복사하지 않는다. 영속 발송 큐는 이번 구현에 없으므로 프로세스 종료를 넘어선 전달 보장은 하지 않는다. 감사/세션/DB 예외가 발생하면 같은 트랜잭션의 업무 변경도 취소한다.

## 후속 회사 본인 승인 설정 서버 완료

사용자가 완료한 테스트를 지정한 “OK”는 이 초대 묶음의 완료 확인으로 기록한다. 이후 사용자가 [회사 설정 서버 설계](01-company-settings-design.md)를 지정한 별도의 “OK”로 여섯 선택·9개 구현 파일·API 1개·8개 조건을 확정했다. 해당 설정 서버는 구현·검증을 완료했고 기존 347개를 포함한 전체 391개 테스트·8개 조건이 PASS다. 이 초대 문서의 여덟 완료 체크와 당시 347개 통과 증거는 보존한다. 실제 전표 승인·화면·운영 배포는 후속이다.
