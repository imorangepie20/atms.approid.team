# F01·F08-13 두 번째 묶음: 가입·이메일 확인·비밀번호 복구

[문서 인덱스](../README.md) · [인증 정책](01-company-access.md) · [첫 서버 묶음](01-auth-session-design.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **두 번째 서버 묶음 구현·검증 완료**. 확정일: 2026-10-05. 사용자가 이 설계 문서에 “OK”로 동의했다. 영향 작업 F01-02·03·08/F08-13의 이번 서버 범위와 확인 시 최종 비밀번호 설정·발송 종류 간 한도 합산·Nodemailer SMTP/Mailpit·HIBP 조회 장애 시 503 중단을 확정했다. 운영 SMTP/발신 주소 미제공 상태에서는 로컬 캡처 검증까지 진행하며 운영 배달은 별도 조건으로 유지한다.

## 작업 ID와 선행 조건

대상은 F01-02의 직접 가입, F01-03의 이메일 확인·비밀번호 복구/변경, F01-08의 변경 후 세션 폐기 및 F08-13의 해당 감사 기록이다. P-01·02·03·04·10과 F08-10·11·12 완료 기록, 첫 서버 묶음의 실제 검증 기록을 재사용한다. 같은 F01 단계 안의 다음 묶음이며 F13이나 업무 화면 단계로 순서를 바꾸지 않는다.

정책값의 원본은 [AUTH-01~10](01-company-access.md#사용자-위임으로-확정한-인증-기본-정책)이다. 여기에서는 확정한 API·저장·기술 선택과 실제 파일별 구현 범위를 기록한다. 회사 등록·초대·세무사 요청·역할 관리·프런트엔드 연결은 후속 묶음이다. **이 묶음만으로 F01-01~08 또는 F08-13 체크박스를 완료하지 않는다.**

## 확정한 이번 구현 범위

1. **직접 가입**: 이메일과 비밀번호를 검증하고 이메일 미확인 사용자를 만든다. 가입만으로 회사·소속·역할·세션을 만들지 않는다. 이미 존재하는 주소에 대한 가입 요청은 기존 비밀번호와 사용자 상태를 덮어쓰지 않는다. 외부 응답으로 주소 존재 여부를 구별하지 않는다.
2. **이메일 확인**: 확인용 난수 토큰과 만료 시각을 저장하고 이메일을 보낸다. 확인을 완료할 때 토큰과 사용자가 선택한 비밀번호를 함께 제출한다. 이메일 소유자가 비밀번호를 최종 설정하므로 제3자가 먼저 가입해 둔 비밀번호를 그대로 활성화하지 않는다. 기존 가입 비밀번호를 기억하지 못해도 확인 메일 재발송 후 소유자가 비밀번호를 설정할 수 있다. 확인 후 자동 로그인하지 않고 기존 로그인 API를 사용한다.
3. **비밀번호 복구**: 이메일 확인이 끝난 활성 계정에 재설정 메일을 보낸다. 없는 계정·미확인 계정·중지 계정에도 같은 접수 응답을 반환한다. 재설정 완료 시 새 비밀번호 저장·일회용 토큰 소비·남은 관련 토큰 무효화·모든 세션 폐기·감사를 같은 DB 트랜잭션으로 처리한다.
4. **로그인 중 비밀번호 변경**: 기존 세션·Origin·CSRF와 5분 이내 비밀번호 재확인을 요구한다. 새 비밀번호를 검사하고 모든 기기의 세션을 폐기한 뒤 다시 로그인하도록 한다. 현재 쿠키도 삭제한다.
5. **이메일 제한과 장애 처리**: 이메일 확인/복구의 계정 및 IP 제한을 DB에 저장한다. 가입의 최초 확인 메일도 동일한 발송 제한에 포함했다. 발송 요청 종류를 바꾸어 한도를 우회하지 못하도록 공통 버킷을 사용한다. 실패 정보를 안전하게 기록하고, 발송 실패를 이메일 전달 성공으로 보고하지 않는다.
6. **비밀번호 검사**: 확정한 길이·Unicode·공백 정책과 Argon2id 비용을 재사용한다. 새 비밀번호를 받는 네 경로(가입·확인·재설정·변경)에 동일한 검사를 적용한다. 길이는 Unicode 코드 포인트로 세며 로그인 입력의 길이 검사도 일치시킨다. 공백 제거·복잡성 강제·정기 변경은 추가하지 않는다.

2번의 확인 시 최종 비밀번호 설정과 5번의 발송 한도 합산은 이번 범위의 사용자 “OK”로 확정했다. 기존 AUTH 정책의 확정 근거와 구분한다.

## 실제 API 계약

모든 경로는 기존 `code/message/details` 오류 계약, 엄격한 입력 스키마와 `Cache-Control: no-store`를 사용한다. 공개 POST도 기존 허용 Origin 검사를 거친다. 토큰 소비는 POST로만 수행하고 GET으로 사용자 상태·토큰·세션을 변경하지 않는다.

| 메서드·경로 | 입력 | 처리·응답 |
| --- | --- | --- |
| POST `/api/auth/register` | email, password | 미확인 사용자 등록 및 확인 메일 시도. 계정 존재와 무관한 202 접수 응답; 세션 발급 없음 |
| POST `/api/auth/email-verification/request` | email | 미확인 활성 계정에 확인 메일 재발송. 계정 상태와 무관한 202 접수 응답 |
| POST `/api/auth/email-verification/confirm` | token, newPassword | 토큰 소비와 최종 비밀번호·이메일 확인 시각·감사 저장. 200; 자동 로그인 없음 |
| POST `/api/auth/password-reset/request` | email | 확인된 활성 계정에 복구 메일 시도. 계정 상태와 무관한 202 접수 응답 |
| POST `/api/auth/password-reset/confirm` | token, newPassword | 토큰 소비·해시 변경·전체 세션 폐기·감사. 200; 새 로그인 필요 |
| POST `/api/auth/password/change` | newPassword | 세션·CSRF·Origin·5분 재확인 후 변경·전체 세션 폐기·쿠키 삭제. 200 |

토큰 오류는 잘못된 값·만료·사용됨·재발송으로 무효화됨을 같은 실패로 취급한다. 입력 오류 400, 인증 실패 401, 보호 검사 실패 403, 제한 429를 재사용한다. 비밀번호 검사 서비스의 통신 실패는 503으로 처리하고 저장을 진행하지 않는다. 이메일 접수 202는 **배달 완료 보증이 아니다**. 실제 발송 실패는 계정 상태에 따른 다른 HTTP 응답으로 노출하지 않고 내부 제한된 사건으로 남긴다. 불필요한 계정별 조기 반환을 피하고 응답 시간의 차이도 통합 검증한다.

## 저장과 실패 흐름

- 기존 User와 UserSession을 재사용하고 새 모델은 **UserActionToken 하나**로 제한한다. id, userId, purpose(EMAIL_VERIFICATION 또는 PASSWORD_RESET), tokenHash, createdAt, expiresAt, usedAt, invalidatedAt를 저장한다. 토큰 해시의 유일성, 사용자 외래키, 시각 순서와 용도 제약을 추가 마이그레이션으로 적용한다. 기존 마이그레이션을 수정하거나 DB를 reset하지 않는다.
- 토큰은 Node crypto의 32바이트 난수로 만들고 DB에는 SHA-256 해시만 저장한다. 이메일 확인은 24시간, 복구는 30분을 적용한다. 같은 사용자의 같은 용도 재발송은 미사용 토큰을 먼저 무효화한다. 동시에 소비한 요청 중 하나만 성공하도록 사용자 잠금과 조건부 갱신을 사용한다. 확인·재설정·변경의 경합도 같은 사용자 잠금으로 처리한다.
- 이메일 전송은 DB 변경을 commit한 뒤 수행한다. SMTP를 기다리는 동안 DB 잠금을 유지하지 않는다. 전송 작업은 메모리에서 비동기로 추적하고 정상 종료 때 진행 작업을 기다린다. 접수 응답은 SMTP 시간/결과를 기다리지 않으며 최소 100ms 대기로 짧은 DB 경로 차이를 완화한다. 임의의 부하에서 계정 존재 여부에 따른 응답 시간을 완전히 같게 보장하는 검증은 아니다. 확인 메일 전송 실패 시 해당 토큰만 조건부 무효화하고 재발송을 사용할 수 있도록 한다. 발송 중 프로세스가 종료되어도 토큰 원문을 DB·파일·로그에 저장해 복원하지 않는다. 자동 재시도 큐는 이번 범위에 추가하지 않는다.
- 비밀번호 변경/재설정 완료 알림은 상태 변경이 commit된 뒤 발송한다. 알림 실패가 이미 변경한 비밀번호와 폐기한 세션을 되돌리지 않는다. 안전한 발송 실패 기록을 남기며 원문 토큰·비밀번호·SMTP 자격증명·메시지 본문은 감사/에러 로그에 넣지 않는다.
- LoginRateBucket을 이메일 발송 제한에도 재사용한다. 로그인 제한 키와 이메일 제한 키의 용도를 분리하고 이메일 종류 간에는 발송 한도를 합산한다. 없는 계정도 요청 횟수에 포함하여 존재 여부가 제한 결과로 드러나지 않게 한다. 계정 3회/15분, IP 20회/15분의 확정값을 중앙 설정에서 읽는다.
- AuditEvent의 기존 사건 유형 CHECK는 새 가입·확인·재설정·변경·발송 실패 사건을 허용하도록 **새 마이그레이션**에서 갱신한다. 사건 이름·허용 필드는 서비스와 테스트에서 함께 제한한다. 사용자 변경과 성공 감사는 같은 트랜잭션이며 감사 실패 시 모두 롤백한다.

## 확정한 이메일과 비밀번호 검사 기술

### SMTP와 개발 메일함

**확정·적용: Nodemailer 10.0.14 SMTP + 개발용 Mailpit 1.31.4.** Nodemailer는 SMTP 전송을 담당하고 Mailpit은 개발 PC에서 메일을 받아 화면/API로 검사한다. 운영 서비스·발신 주소는 아직 미확정이다. 사용자가 제공자/발신 주소를 알려주면 설정 이름과 운영 검증 경계를 반영한다. 비밀번호·API 키를 문서나 대화에 넣지 않고 환경 변수로 주입한다.

개발 구성은 Mailpit의 SMTP/UI 포트를 127.0.0.1에만 바인딩하고 전달/릴레이를 켜지 않는 것이다. 통합 테스트는 캡처한 메일에서 토큰을 메모리로 추출해 실제 HTTP 확인·복구를 진행한다. 컨테이너는 [공식 릴리스 v1.31.4](https://github.com/axllent/mailpit/releases/tag/v1.31.4)의 이미지 다이제스트 `sha256:b68349e3a014b90c5610bfb26b2ae36f3892d7b8cf25ee140c6c71c98d2fcf48`에 고정했다. 운영은 인증된 SMTP와 검증된 인증서의 TLS/STARTTLS를 요구하며 개발 메일함으로 자동 대체하지 않는다. [공식 릴리스 Nodemailer 10.0.14](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.14)와 @types/nodemailer 8.0.2를 확인해 잠금 파일에 고정했다.

운영 SMTP 미제공 상태에서 로컬 캡처 발송·토큰·복구 흐름까지의 검증 범위를 사용자가 이 문서의 “OK”로 승인했고 실제 검증했다. 실제 수신함 전달·발신 도메인 인증·홈서버 SMTP 통신은 배포 전 별도 운영 조건으로 남긴다. 개발 메일함을 운영 발송 완료 근거로 사용하지 않는다.

근거: [Nodemailer SMTP 공식 문서](https://nodemailer.com/smtp)는 TLS·STARTTLS 설정과 전송을 설명하며 `verify()`만으로 발신 주소의 실제 수락/배달을 확인할 수 없다고 명시한다. [Mailpit 공식 문서](https://mailpit.axllent.org/docs/)는 SMTP 캡처, 웹 화면 및 통합 테스트 API를 제공한다.

### 흔한 비밀번호와 유출 비밀번호

**확정·적용: HIBP Pwned Passwords의 해시 범위 조회와 서비스/사용자 정보의 완전 일치 차단.** 완성된 새 비밀번호를 서버에서 한 번 검사한다. SHA-1 해시의 앞 5자리만 HTTPS로 전송하고 나머지는 서버 안에서 비교한다. `Add-Padding: true`를 사용하며 출현 횟수가 0인 패딩은 차단 대상으로 취급하지 않는다. 원문·전체 해시·이메일을 HIBP에 보내지 않는다. SHA-1은 조회용이며 저장 해시는 계속 Argon2id이다.

HIBP 자료에서 발견된 흔한/유출 비밀번호를 거부한다. 서비스 이름·도메인·사용자 이메일과 완전히 일치하는 비밀번호도 별도로 거부한다. 이 비교에 사용하는 복사본과 실제 해시 입력을 구별해 사용자의 원문 공백·Unicode를 바꾸지 않는다. 알려지지 않은 모든 유출을 검출한다는 보장은 하지 않는다.

확정한 장애 정책은 **조회 시간 초과·비정상 응답 시 가입/새 비밀번호 저장을 중단하고 503으로 재시도를 안내**하는 것이다. 기존 로그인·정상 세션은 이 조회에 의존하지 않는다. 조회 제한 시간 3초·최대 응답 256 KiB·리다이렉트 거부를 중앙 설정에 두고 사용자가 확정한 값으로 구현했다. 테스트에서는 외부 조회를 통제한 HTTP 대역으로 교체하고, 실제 비밀번호로 외부 서비스를 시험하지 않는다.

장애 시 새 비밀번호 저장의 가용성이 떨어지는 점이 이 안의 영향이다. 외부 의존성을 없애려면 전체 해시 자료의 로컬 저장·갱신·용량 관리가 필요하므로 별도 대안으로 검토할 수 있다.

근거: [HIBP 공식 API 문서](https://haveibeenpwned.com/API/v3#PwnedPasswords)는 앞 5자리 범위 조회·패딩과 횟수 0의 의미를 설명한다. [OWASP 복구 지침](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)은 존재 여부를 숨기는 응답·일회용 만료 토큰·재설정 후 세션 폐기와 알림의 근거다. 장애 정책과 ATMS 경로는 사용자가 확정한 ATMS 설계이며 공식 문서가 강제하는 선택으로 표시하지 않는다.

## 수정·생성할 구현 파일 목록

실제 최초 수정 파일은 **`server/src/config/app.config.ts`**이다. IDE에서 열고 중앙 시간/한도·SMTP·조회 설정을 설명한 다음 구현한다. 원래 최초 수정 대상 main.ts부터 진행한 F08-10의 순서를 바꾸는 것이 아니다. 이번 묶음에서는 아래 관련 파일을 함께 변경하고 전체 검증을 묶어서 실행했다.

| 구분 | 경로 | 변경 목적과 실행 흐름 |
| --- | --- | --- |
| 수정 | `server/src/config/app.config.ts` | 확정한 링크 만료·발송 한도와 승인한 SMTP/HIBP 설정을 한곳에서 검증. 운영 누락/잘못된 설정 거부 |
| 수정 | `server/prisma/schema.prisma` | UserActionToken 및 User 관계. 원문 없이 해시·용도·만료·사용/무효화 시각 저장 |
| 생성 | `server/prisma/migrations/20261005030000_account_lifecycle/migration.sql` | 토큰 테이블·인덱스·제약과 감사 유형 제약 갱신. 기존 데이터 보존 |
| 수정 | `server/src/auth/auth.module.ts` | 가입/복구 컨트롤러·서비스·메일 서비스를 기존 DB/인증 기반에 연결 |
| 수정 | `server/src/auth/auth.schemas.ts` | 새 6개 API의 엄격한 입력 계약, Unicode 길이 검사와 기존 로그인 검사 일치 |
| 수정 | `server/src/auth/auth.guard.ts` | 명시한 공개 경로 및 발송 IP 제한 연결. 기존 Origin/기본 보호 유지 |
| 수정 | `server/src/auth/login-rate-limit.service.ts` | 기존 제한 저장소에 이메일 용도 키와 계정/IP 발송 예약 추가. 로그인 한도 유지 |
| 생성 | `server/src/auth/account-lifecycle.controller.ts` | 새 6개 경로·고정 응답·보호 메타데이터·변경 후 쿠키 삭제 |
| 생성 | `server/src/auth/account-lifecycle.service.ts` | 가입·확인·복구·변경 조정, 사용자 잠금·상태 재검사·전체 세션 폐기·감사 원자성 |
| 수정 | `server/src/auth/auth.service.ts` | 비밀번호 변경/복구와 로그인·재확인의 사용자 잠금을 공유해 이전 해시로 세션이 남는 경합 방지 |
| 생성 | `server/src/auth/action-token.service.ts` | 난수·해시·만료·재발송 무효화·일회용 소비. 메일에만 원문을 일시 전달 |
| 생성 | `server/src/auth/password-policy.service.ts` | 새 비밀번호 길이·차단 검사·HIBP 범위 응답 검증·Argon2id 해시 생성 |
| 생성 | `server/src/mail/mail.service.ts` | SMTP 전송·안전한 실패 분류. 개발 캡처/운영 TLS 조건 적용 |
| 생성 | `server/src/mail/mail.templates.ts` | 확인·재설정·완료 알림. 링크는 검증한 웹 Origin에서 생성하며 요청 Host 미사용 |
| 수정 | `server/src/audit/audit.service.ts` | 신규 고정 사건 유형과 허용 정보만 기록. 비밀번호·토큰·메일 본문 제외 |
| 수정 | `server/package.json`, `server/package-lock.json` | Nodemailer와 필요한 타입 추가·정확한 버전 고정 |
| 수정 | `server/.env.example` | SMTP/발신 주소 예시, 운영 필수값과 개발 예외 설명. 실제 비밀값 없음 |
| 수정 | `infra/compose.dev.yml` | 승인한 Mailpit 버전과 127.0.0.1 SMTP/UI 포트. 기존 PostgreSQL 볼륨 보존 |
| 생성 | `server/tests/account-lifecycle.test.ts` | 별도 DB+실제 HTTP+캡처 SMTP로 가입→확인→로그인→복구/변경·동시 토큰 소비 검증 |
| 생성 | `server/tests/password-policy.test.ts` | Unicode/공백·흔한/유출 차단·패딩 0·타임아웃/잘못된 응답·외부 전송 최소화 |
| 수정 | `server/tests/auth-session.test.ts` | 비밀번호 변경 후 모든 기기 차단과 새 공개 경로의 기본 보호 회귀 검사 |
| 수정 | `server/tests/audit.test.ts` | 신규 사건 허용·정보 제한과 실패 롤백 검사 |
| 수정 | `server/tests/database-foundation.test.ts` | 추가 마이그레이션·테이블 및 기존 데이터/seed 제약 보존 검사 |

위 목록은 최초 제시 23개에 로그인 경합 연결 파일을 추가한 **24개 파일**이다. 상세 주석에는 F01/F08-13 변경 영역, 설정 단위, 입력→검사→트랜잭션→메일/응답 흐름과 실패 시 보존/폐기되는 상태를 적는다. 생성된 Prisma 파일은 직접 편집하지 않는다. `server/.env`와 운영 비밀 파일을 임의로 바꾸지 않는다. 프런트엔드 및 홈서버 배포 파일은 이번 목록에 없다.

담당 문서 `01-account-lifecycle-design.md`, `01-company-access.md`, `01-auth-session-design.md`, `08-platform.md`, `docs/README.md`, `IMPLEMENTATION_PLAN.md`, `ROADMAP.md`, `ENVIRONMENT_SETUP.md`를 실제 결과에 맞게 갱신한다. 구현 결과는 아래 검증 근거와 코드 읽는 순서에서 확인한다.

## 구현 후 묶어서 검증할 조건

- [x] 가입만으로 회사/역할/세션이 생기지 않고 기존 계정·중지 상태를 덮어쓰지 않는다. 확인 시 이메일 소유자가 정한 비밀번호만 활성화된다.
- [x] 확인 24시간·복구 30분 경계, 해시만 저장, 재발송 무효화·동시 소비 1건 성공·용도 혼용 거부를 실제 DB/HTTP에서 확인한다.
- [x] 계정 3회/IP 20회와 15분 경계·종류 간 합산·없는 계정의 제한·동시 요청·DB 재연결 후 보존을 확인한다.
- [x] 새 비밀번호의 15~128 코드 포인트·공백/Unicode, 흔한/유출 차단·패딩 0·조회 장애 중 저장 금지와 비밀값 미전송을 확인한다.
- [x] Origin/CSRF·5분 재확인, 복구/변경 후 전체 세션 폐기·쿠키 삭제·자동 로그인 금지와 다른 사용자의 세션 보존을 확인한다.
- [x] 개발 SMTP 캡처에서 실제 메일/링크·완료 알림을 확인하고 전송 오류·프로세스 중단 후 재발송·로그 비밀값 제외를 검사한다. 실제 운영 배달과 구분한다.
- [x] 사용자/토큰/세션/감사 원자성, 감사·DB 실패 롤백과 계정 존재를 숨기는 응답/처리 흐름을 확인한다.
- [x] 기존 서버 전체 행동 테스트·schema 검증·타입·빌드·컨테이너 검증을 한 묶음으로 통과하고 기존 데이터/환경·체크 ID를 보존한다.

위 체크는 **이번 서버 묶음의 실제 테스트로 통과한 조건**이다. 설계 문서 검증과 구분한다. 운영 SMTP 선택·실제 메일 전달, 실제 홈서버 해시 부하·프록시 IP, 프런트엔드 사용자 흐름은 해당 범위에서 따로 검증한다.

## 구현 전 설계 문서 검증 기록

아래는 코드 생성 전 설계 단계의 세 조건과 당시 결과다. 현재 구현 파일이 생성되었으므로 아래의 설계 전 상태를 다시 검사하는 명령 대신 다음 구현 검증을 사용한다.

1. 확정 선행 조건 8개·정책 원본 참조·범위 확인 대기·6개 예정 API·8개 미실행 기능 검증 조건이 일치한다.
2. 수정/생성 23개 파일의 중복/존재 구분, 최초 파일, 인덱스·계획·로드맵·첫 설계의 연결 및 로컬 링크/제목 참조가 유효하다.
3. 기존 소스/정책/환경 파일 121개 해시, 체크 ID 139개 상태와 Hindsight 30분 예약을 보존한다. 원격 최신 문서 일치는 이 검증에 포함하지 않는다.

[당시 설계 검증 결과](../../.artifacts/design-f01-account-lifecycle/results.json)의 PASS는 당시 문서 조건에만 적용한다. 현재 코드의 완료 근거는 아래 별도 기록이다.

설계 검증 기록(2026-10-05): 당시 설계 검증 명령 종료 코드 0, 세 조건 모두 PASS. 선행 조건 8개·예정 API 6개·미실행 기능 조건 8개, 구현 파일 23개·담당 문서 5개·로컬 링크 253개·제목 참조 71개, 보호 파일 121개·체크 ID 139개 보존을 확인했다. Hindsight 예약은 PT30M·Ready이며 이번 변경분의 원격 일치는 확인하지 않았다. 새 API 구현·실제 SMTP 전달의 통과 기록이 아니다.

이번 구현 작업에서 실행한 객관적 검증 묶음은 서버 전체 행동/보안 테스트, schema·타입·build, 컨테이너/SMTP와 로컬 추가 마이그레이션·데이터 보존, 문서/정책/보호 파일 보존의 네 항목이다. 기존 8개 기능 조건을 전체 테스트에서 함께 확인하며 결과는 `.artifacts/implementation-f01-account-lifecycle/`에 기록한다.

## 실제 코드를 읽는 순서

1. [공통 설정](../../server/src/config/app.config.ts)의 AUTH_POLICY와 readMailConfig: 밀리초·발송 횟수·HIBP 응답 크기·SMTP TLS 조건을 한곳에서 정의한다. 운영 누락은 시작 단계에서 거부한다.
2. [입력 스키마](../../server/src/auth/auth.schemas.ts) → [전역 guard](../../server/src/auth/auth.guard.ts) → [컨트롤러](../../server/src/auth/account-lifecycle.controller.ts): 엄격한 입력, Origin/공개 경로/IP 제한과 민감 변경의 CSRF/5분 재확인을 거쳐 고정 응답을 만든다.
3. [계정 서비스](../../server/src/auth/account-lifecycle.service.ts): 가입/메일 요청은 계정 한도→비밀번호 검사→사용자 잠금→등록/토큰/감사 commit→비동기 전송→접수 응답이다. 확인/복구/변경은 잠금 뒤 현재 사용자·세션·토큰/시간을 재검사하고 비밀번호·전체 세션 폐기·감사를 원자적으로 저장한다.
4. [토큰 서비스](../../server/src/auth/action-token.service.ts)와 [비밀번호 정책](../../server/src/auth/password-policy.service.ts): 전자는 난수 해시·재발송 무효화·일회용 소비, 후자는 코드 포인트·해시 범위 조회·응답 검증·Argon2id를 담당한다. SHA-1 조회값과 실제 저장 해시를 혼동하지 않는다.
5. [메일 서비스](../../server/src/mail/mail.service.ts)와 [템플릿](../../server/src/mail/mail.templates.ts): 검증한 Origin의 fragment 링크, SMTP/TLS, 안전한 전송 실패 반환을 담당한다. 실패는 해당 토큰만 무효화하고 완료 알림 실패로 이미 변경한 비밀번호를 되돌리지 않는다.
6. [기존 인증 서비스의 연결 수정](../../server/src/auth/auth.service.ts): 로그인·재확인도 같은 사용자 행을 잠가 이전 해시로 검증한 세션이 복구 뒤 남지 않게 한다. 기존 로그인 정책은 그대로 유지한다.

## 실제 실행 검증 기록

2026-10-05, E-F01-SERVER-02. `powershell.exe -NoProfile -File .artifacts/implementation-f01-account-lifecycle/run-verification.ps1`로 schema→build→DB 타입→서버 전체 행동 테스트→운영 컨테이너→로컬 추가 마이그레이션을 실행했다. [명령 종료 코드](../../.artifacts/implementation-f01-account-lifecycle/execution.json), [테스트 190개](../../.artifacts/implementation-f01-account-lifecycle/tests.json), [실제 DB/SMTP 근거](../../.artifacts/implementation-f01-account-lifecycle/database-evidence.json), [기존 데이터 보존](../../.artifacts/implementation-f01-account-lifecycle/local-database-evidence.json)을 참조한다.

- PASS: 전체 190개. 신규 계정 흐름 22개·비밀번호 검사 19개·SMTP 3개, 기존 인증 20개·감사 4개·권한 17개와 금액/DB/API/health 회귀 검사가 통과했다. SMTP 수락과 캡처 메일에서 토큰을 읽어 실제 HTTP로 확인/복구했고 외부 수신자에게 보내지 않았다.
- PASS: Prisma schema·서버 build·DB 타입 검사 종료 코드 0. 모델 13개 중 이번 새 모델은 UserActionToken 하나다.
- PASS: 운영 이미지 build·Argon2 검증·Secure 설정·SMTP 모듈 로딩 종료 코드 0. 개발 기본 DB는 기존 메타데이터와 회사/사용자/세션 수·환경 파일을 보존한 채 추가 마이그레이션만 적용했고 seed/reset하지 않았다. Mailpit 포트 두 개 모두 127.0.0.1에 바인딩했다.
- PASS: 보호 파일 105개·체크 ID 139개·AUTH 정책 10행 보존, 담당 문서 링크와 24개 구현 파일, Hindsight PT30M 예약을 확인했다. 최종 결과는 [네 기준 검증 기록](../../.artifacts/implementation-f01-account-lifecycle/results.json)을 기준으로 한다.

첫 검증은 행동 검사 FAIL(해시 표기 순서를 고정한 동일 검사 3건), 로컬 마이그레이션 UNVERIFIED(행동 검사 통과 전 미실행), 나머지 두 기준 PASS였다. [첫 결과](../../.artifacts/implementation-f01-account-lifecycle/first-pass-results.json)를 보존했다. 매개변수 순서 가정 대신 Argon2 라이브러리의 needsRehash로 실제 설정을 확인하도록 수정하고 **전체 검증 묶음**을 다시 실행해 통과했다.

최종 문서/체크 반영 뒤 `python .artifacts/implementation-f01-account-lifecycle/verify.py --final`로 네 기준을 다시 대조한다. 이 기록은 이번 서버 부분의 완료다. 회사 관리·초대·역할 변경·실제 웹 화면·홈서버 부하/프록시·운영 SMTP 실제 배달과 원격 Hindsight 최신 문서 일치는 아직 검증하지 않았다. 전체 F01/F08-13 체크와 집계는 변경하지 않는다.

검증 범위 해석: 프로세스 중단 후 재발송 검사는 commit 뒤 미전달 토큰이 남은 DB 상태를 재현해 대체 발급을 확인한 것이다. 실제 홈서버 프로세스 강제 종료 시험을 했다고 주장하지 않는다. HIBP 통신은 통제한 응답/타임아웃 대역으로 검증하며 실제 사용자 비밀번호를 외부 조회에 사용하지 않았다. 메일 본문의 만료 안내도 AUTH_POLICY에서 계산해 중앙 설정과 일치시켰다.
