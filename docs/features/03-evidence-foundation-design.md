# F03 첫 증빙 서버 제안

최신 증빙 서버 기록(2026-10-06): 사용자 다시해봐(server/.env 참조) 후 변경된 환경으로 버킷 조회 HTTP200과 실제 R2 객체/API 시험을 확인했다. 현재8PASS/0FAIL/0UNVERIFIED, 서버587PASS/0FAIL/0SKIP(24파일·종료0), 프런트 build/lint 종료0·Appearance16·E2E203 PASS다. 첫 증빙 서버 범위 검증을 완료했으며 브라우저 업로드/미리보기·전표 연결은 후속이다. F03 상위 체크는 유지하며 [최신 실행 근거](03-evidence-foundation-design.md#실제-r2-연결-수정-후-전체-검증-완료--2026-10-06)를 따른다.

[문서 인덱스](../README.md) · [증빙 요구사항](03-evidence.md) · [확정 P-07](03-evidence-storage-design.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **E1~E8 사용자 확정·첫 서버 전체8PASS·브라우저/전표 연결 후속**. 제안일·확정일: 2026-10-06. 영향 ID: F03-01·02·05·06 및 F03-03·07의 서버 부분/F08-11·13/F12-03의 저장·검사 설정 부분. 확정 근거: E1~E8·API5개·24파일·검증8조건에 대한 구체적인 확인 질문 직후 사용자 “확정”(src/lib/api.ts 지정). 아래 값8개를 모두 실제 선택값으로 채택했다. 직전 P-07 확정과 이번 서버 범위 확정은 별도 기록이다.

기존 P-01·02·03·04·10, P-07과 회사·권한·거래처 서버/브라우저 부분을 재사용한다. F01/F02의 상위 전체 체크는 후속 업무 연결이 남아 미체크다. 승인 전에는 증빙 모델·서버 모듈·프런트 API가 없었다. 이제 승인된 서버/스키마/설정24파일을 구현하며 프런트 API는 후속이다. F03 전체7항목은 필수 검증이 끝나기 전 완료 처리하지 않는다.

## 사용자 확정 구현 범위 E1~E8

| ID | 사용자 확정값 | 의미와 영향 |
| --- | --- | --- |
| E1 첫 범위 | 원본1개와 메타데이터 등록, 완료 목록·검색·상세, 권한 확인 원본 다운로드, 자기 등록 요청 상태 조회의 서버 API5개 | 서버·스키마·저장·검사부터 검증한다. 브라우저 화면/미리보기·전표 연결/해제·OCR/수집·업무 수정/삭제는 후속 범위다. |
| E2 입력 | 분류 RECEIPT/TAX_INVOICE/OTHER, 제목1~100자, 선택 발생일·거래처, creationRequestId UUID + PDF/JPEG/PNG1개 | 발생일은 참고 메타데이터이며 회계일자·세무 적격 판정이 아니다. 자기 회사의 현재 활성 거래처만 등록 시 연결한다. 비활성화 이후 과거 연결은 유지한다. |
| E3 파일 검사 | 확장자/신고 MIME/실제 헤더·종료 구조를 대조하고 ClamAV clamd INSTREAM 검사 성공 후에만 저장 완료 | 악성 파일은 거부, 검사 불가/시간 초과는503로 완료 금지. 서명 DB를 갱신한다. 파일 구조 검사는 완전한 파서/무해 보장이 아니며 첫 범위에서 PDF와 이미지를 웹 페이지 안에 렌더링하지 않는다. |
| E4 권한 | 기존 evidence.create/read와 현재 세션·회사·역할을 재사용 | 관리자·회계 담당자·외부 세무사 등록, 다섯 역할 조회. Origin/CSRF를 기존 쓰기 경로처럼 검사하고 외부 I/O 후 완료 직전에도 권한/거래처를 재검사한다. 새 재인증·역할·로그인 시간 정책은 만들지 않는다. |
| E5 완료·재시도 | 회사+creationRequestId 유일, 입력/파일 지문 비교, 업로드 예약·파일 검사·R2 임시 저장/원본 복사 확인·DB 완료의 순서 | 같은 ID/같은 내용의 완료 재요청은 기존 결과, 다른 내용은409. 진행 중 자동 재전송 없이 상태 확인. 실패 상태만 동일 내용으로 명시적 재시도, 정리 만료한 ID는 재사용 금지. DB와 객체 저장소 사이의 장애도 추적한다. |
| E6 조회·다운로드 | 완료 데이터만 회사별 조회, 원본은 API 경유 attachment 다운로드 | 목록은 제목/분류/거래처 필터·커서·최대100개. 다른 회사 증빙은404. 원본 바이트 수/내부 SHA-256을 대조하고 no-store/nosniff를 지정한다. 공개/서명 URL과 저장소 키를 반환하지 않는다. |
| E7 정리·감사 | 내부 작업5분 주기로 미완성24시간 정리, 완료 등록 감사1개 | 활성 작업/완료 증빙 참조가 없는 DB 기록 소유 키만 정리한다. 정리 실패는 추적을 보존하고 다음 작업에서 재시도한다. 완료 원본을 삭제하는 API는 없다. 감사·로그에 파일 내용/제목/파일명/키/지문/토큰을 넣지 않는다. |
| E8 완료 검증 | 전용 DB·비공개 실제 R2 시험 영역·실제 ClamAV로 검증하고 기존 전체 묶음 회귀 실행 | 가짜 저장소 시험만으로 실제 R2 완료를 선언하지 않는다. 계정/버킷 범위 자격 증명은 환경 주입하며 문서/로그/채팅에 비밀값을 기록하지 않는다. 유료 가입·외부 버킷 생성은 이번 제안/구현 파일 승인에 포함하지 않는다. |

## API5개와 입출력

아래는 `/api` 뒤의 경로다. 기존 `code·message·details` 오류 응답과 세션 가드를 재사용한다. 요청의 회사 식별자는 경로에서 확정하고 본문 회사/작성자/저장 키를 받지 않는다.

| 번호 | 메서드·경로 | 권한 | 정상 결과 |
| --- | --- | --- | --- |
| 1 | POST `/companies/:companyId/evidence` | evidence.create | 최초201 `{ evidence, created: true }`, 동일 완료 재요청200 `{ evidence, created: false }` |
| 2 | GET `/companies/:companyId/evidence` | evidence.read | `{ items, nextCursor }` |
| 3 | GET `/companies/:companyId/evidence/requests/:creationRequestId` | evidence.create + 현재 사용자 소유 요청 | `{ creationRequestId, state, evidenceId, retryable, failureCode }` |
| 4 | GET `/companies/:companyId/evidence/:evidenceId` | evidence.read | `{ evidence }` |
| 5 | GET `/companies/:companyId/evidence/:evidenceId/original` | evidence.read | 검증한 원본 바이트·Content-Type·Content-Disposition attachment |

요청 상태의 정적 `requests` 경로를 `:evidenceId`보다 먼저 선언한다. 타 사용자 요청 상태 조회는404이며 완료 증빙의 목록/상세 조회 권한은 기존 read를 따른다.

등록 본문은 multipart의 JSON `metadata` 필드1개와 `file`1개다. metadata 허용 키는 `creationRequestId, kind, title, occurredOn, counterpartyId`뿐이며 중복/알 수 없는 필드·다중 파일을 거부한다. 발생일과 거래처는 생략/명시적 null을 허용하고 문자열 날짜는 실제 그레고리력 `YYYY-MM-DD`를 검사한다. 제목은 양끝 공백 제거 후 유니코드 코드포인트 기준1~100자, 파일명은1~200자이며 NUL/제어문자/경로 구분자를 거부한다. 저장 키는 파일명이 아니라 서버 UUID로 만든다.

파일 바이트는0보다 크고 최대10,485,760바이트다. multipart 전체는12MiB, metadata는8KiB로 별도 제한하고 Content-Length와 무관하게 실제 수신 바이트를 제한한다. 허용 MIME은 application/pdf, image/jpeg, image/png다. magic bytes만 보고 허용하지 않고 파일 종류별 기본 구조/종료 마커·길이 범위도 검사한다. 클라이언트 신고 값과 불일치하면422, 크기 초과413, 부적절한 multipart400, 악성 파일422, 저장/검사 가용성 문제503, 요청 ID 충돌409, 연결 거래처 부적합422다. 내부 저장/검사 예외는 공통 안전한 오류 코드로 변환한다.

공개 evidence 필드는 `id, companyId, kind, title, occurredOn, counterpartyId, originalFileName, mediaType, byteSize, createdById, createdAt`의11개다. 내부 키·파일 지문·검사 로그·자격 증명은 내보내지 않는다. 목록 q는 제목 검색1~100자, kind는 위 enum, counterpartyId/cursor는 UUID, limit은 기본20·최대100이다. ID 오름차순 키셋 페이지네이션이며 커서는 같은 회사/필터에 속하는 완료 ID만 허용한다(불일치400). 미완성 예약은 목록/상세/다운로드에서 제외한다.

GET은 기존 읽기 계약대로 활동을 연장하지 않는다. 쓰기 요청은 기존 세션 정책을 유지하며 새 쿠키 식별자 재발급·다른 기기 종료를 추가하지 않는다. 원본 다운로드는 최대10MiB 메모리 내 바이트 수/지문 확인 후 응답한다. 요청 상태와 목록도 no-store다. 제목/파일명은 HTML이 아닌 문자열로 전달하고 Content-Disposition은 표준 인코딩으로 작성한다.

## 저장 상태와 실패 흐름

추가할 `Evidence`는 완료 자료만 저장하고 원본 참조·내부 지문·생성자·회사·거래처 연결을 가진다. `EvidenceUpload`는 회사+요청 ID 유일, 요청 소유자·입력/파일 지문·각 시도 UUID·예약 상태·마지막 유효 활동·작업 잠금 만료·추적할 키를 가진다. 회사+거래처 복합 FK와 완료 참조 FK/유일성으로 다른 회사 연결과 중복 완료를 DB에서도 거부한다. 과거 원본/연결은 불변이며 스키마 cascade로 완료 원본/증빙이 지워지게 만들지 않는다.

상태는 `PENDING → READY` 또는 `FAILED`, 정리 대상은 `CLEANING → EXPIRED`다. FAILED의 명시적 동일 내용 재시도는 새 시도 UUID로 PENDING이 된다. READY는 종결 상태다. CLEANING/EXPIRED ID는409와 새 ID 사용 안내를 반환한다. 단순 상태 조회/충돌/반복 오류는 유효 활동 시각을 갱신하지 않는다.

1. 인증/회사 권한과 제한된 본문·형식을 검사한다. 정규화 metadata/원본 파일명/실제 파일 바이트의 지문으로 요청 ID 재사용을 비교한다. 타 사용자가 소유한 요청 ID는 사용할 수 없다.
2. DB 트랜잭션에서 업로드 예약과 시도별 임시/원본 후보 키를 먼저 기록한다. 각 시도 키는 유일하여 재시도/늦은 작업이 다음 시도 키를 덮어쓰지 않는다. PENDING을 다른 작업이 동시에 실행하지 못하게 한다.
3. DB 트랜잭션 밖에서 악성 파일 검사·R2 임시 저장·원본 영역 복사·바이트/지문 확인을 수행한다. 파일 형식 검사는 검사 서버를 대체하지 않는다. 각 외부 I/O 시간 제한20초, 검사30초, 활성 잠금2분을 공통 설정에 모으고 외부 I/O 전에 조건부 잠금을 갱신한다. 잠금 소유권을 잃으면 완료하지 않는다.
4. 완료 트랜잭션에서 현재 세션/사용자/회사 소속·역할·활성 거래처와 시도 잠금을 다시 검사한다. Evidence 생성·예약 READY·`EVIDENCE_REGISTERED` 감사1행을 함께 커밋한다. 저장소 작업 성공만으로 완료 응답을 하지 않는다.
5. 실패하면 가능한 경우 FAILED/안전한 코드로 기록한다. 프로세스 종료로 상태 기록을 못 해도 키 예약은 남아 정리가 가능하다. 실패 파일은 업무 목록/완료 연결로 보이지 않는다. 응답 유실 후에는 요청 상태 확인을 우선하고 자동 재등록하지 않는다.

DB와 R2 사이에 분산 트랜잭션이 있다고 가정하지 않는다. R2 원본 후보 파일도 DB 완료 참조가 생기기 전까지는 미완성 업로드 소유 대상이다. 정리 작업은24시간 경과·활성 잠금 없음·READY/완료 참조 없음 조건을 DB에서 잠그고 CLEANING으로 바꾼 뒤, 기록된 자기 영역 키만 제거한다. 버킷 전체/완료 영역에 광범위 삭제 또는 자동 만료 규칙을 적용하지 않는다. 삭제 확인 실패 시 추적 키를 지우지 않는다. EXPIRED 기록/시도 키를 보존하여 시간 초과 뒤 늦게 생성된 파일도 후속 조정 작업에서 찾아 제거하고 완료 원본 참조가 발견되면 제거를 중단한다. 다중 작업자·정리/완료 경합·늦은 I/O를 실제 행동 시험으로 검증한다.

원본 복사와 내용 확인 뒤 임시 사본을 제거하는 단계는 등록 처리에 포함한다. 제거 실패 시 자기 임시 키를 예약에 남겨 후속 사본 제거로 재시도한다. 이 사본 제거는24시간 지난 미완성 정리와 구분하며 READY인 경우에도 `tmp/`의 해당 사본 키만 대상이다. 완료 원본 키는 항상 제외한다. 완료 원본에 교체/삭제 기능이나 자동 만료를 추가하지 않는다. 이 설계는 애플리케이션 보존 정책이며 R2 Object Lock을 구현했다고 주장하지 않는다.

감사 필드는 기존 공통 actor/company/time/request 식별자와 evidenceId·정해진 kind enum만 추가한다. 오류 진단은 예약/시도 ID와 고정 코드만 기록한다. 새 감사 이벤트는 기존 SQL 허용 목록도 함께 추가한다. 파일 이름·제목·발생일·키·바이트/내용/지문과 악성 파일 서명 문자열은 감사/접근 로그에 남기지 않는다.

## 저장·검사 환경과 공식 근거

R2 연결은 `@aws-sdk/client-s3`로 제공자 endpoint/버킷/접근 키를 서버 환경에서만 읽는다. 공개 URL·브라우저 직접 업로드·사용자 지정 endpoint를 받지 않는다. 키를 실제 출력하거나 저장소 응답 전체를 로그에 남기지 않는다. R2 설정이 없으면 해당 증빙 쓰기/원본 경로는503이며 기존 로그인·거래처/읽기 메타데이터 기능을 막지 않는다. 비밀 설정을 임의로 채우지 않는다.

ClamAV는 공식 Docker 이미지의 검증한 버전/다이제스트를 고정해 개발/홈서버 compose에 내부 서비스로 추가하고 서명 DB 볼륨/freshclam 갱신을 구성한다. 개발 API가 호스트에서 실행할 때만 루프백 포트, 운영은 Docker 내부망만 허용한다. 운영 readiness에 검사 상태를 포함하고 정의/설정이 없거나 유효한 성공 응답을 못 받으면 업로드를 완료하지 않는다. 바이러스 DB가24시간 이상 갱신되지 않으면 검사 가용성 실패로 처리하는 안이다. 컨테이너 실제 자원 사용량·운영 성능은 측정 전이며 P-05를 임의 확정하지 않는다.

공식 [R2 S3 지원 표](https://developers.cloudflare.com/r2/api/s3/api/)에서 필요한 Put/Get/Head/Copy/Delete 작업의 지원 여부를 확인했다. 공식 [ClamAV INSTREAM 규약](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)은 스트림 전송·크기 제한·OK/FOUND/ERROR 응답을 설명한다. [공식 Docker 구성](https://docs.clamav.net/manual/Installing/Docker.html)을 검사 서비스 제안 근거로 사용한다. 외부 문서를 읽은 것은 실제 R2 인증 접근이나 ClamAV 실행 성공이 아니다.

## 승인 후 구현·설정·시험 파일24개와 목적

아래24개는 이번에 변경한 문서 파일 수와 다르다. 승인 뒤 최초 파일 `server/prisma/schema.prisma`를 IDE에서 열고 추가 모델/관계/실패 보호를 설명한 후 구현한다. 이어지는 파일도 목적·입출력·성공/실패 흐름을 주석과 줄 번호로 설명한다. `src/lib/api.ts`와 화면/E2E 파일은 서버 검증 뒤의 브라우저 범위에서 제시한다. 자동 생성 Prisma 산출물과 검증용 `.artifacts`는 수동 구현 파일 수에서 제외한다.

| 번호 | 구분 | 파일 | 목적 |
| --- | --- | --- | --- |
| 1 | 수정 | `server/prisma/schema.prisma` | 증빙/예약 모델·상태·회사/거래처 FK·불변 원본 관계 |
| 2 | 생성 | `server/prisma/migrations/20261006020000_evidence_foundation/migration.sql` | 추가 테이블/인덱스/제약·감사 허용 이벤트 |
| 3 | 수정 | `server/src/config/app.config.ts` | 크기/시간/정리/검사 정책 공통값·환경 참조 |
| 4 | 수정 | `server/src/audit/audit.service.ts` | 증빙 등록 이벤트와 안전한 감사 필드 |
| 5 | 수정 | `server/src/app.module.ts` | 증빙 모듈 연결 |
| 6 | 생성 | `server/src/evidence/evidence.module.ts` | controller/service/저장/검사/정리 의존성 등록 |
| 7 | 생성 | `server/src/evidence/evidence.schemas.ts` | 엄격한 metadata/query/UUID 입력과 공개 결과 계약 |
| 8 | 생성 | `server/src/evidence/evidence.controller.ts` | API5개·권한·multipart 제한·응답 헤더 |
| 9 | 생성 | `server/src/evidence/evidence.service.ts` | 요청 예약/완료/조회·중복/현재 권한 재검사 |
| 10 | 생성 | `server/src/evidence/evidence-storage.service.ts` | 비공개 R2 SDK I/O·지문 확인·추적 키 제한 |
| 11 | 생성 | `server/src/evidence/evidence-file-validation.ts` | 형식/길이/파일명·기본 구조 검사 |
| 12 | 생성 | `server/src/evidence/evidence-scanner.service.ts` | clamd 스트림·시간/서명 상태·검사 실패 거부 |
| 13 | 생성 | `server/src/evidence/evidence-cleanup.service.ts` | 내부 정리/잠금/만료·늦은 I/O 조정 |
| 14 | 수정 | `server/package.json` | S3 클라이언트/multipart 파서 직접 의존성·시험 명령 |
| 15 | 수정 | `server/package-lock.json` | 설치된 버전/무결성 고정 |
| 16 | 수정 | `server/.env.example` | R2/검사 환경 이름·비밀 없는 예시 |
| 17 | 수정 | `infra/compose.dev.yml` | 개발 ClamAV·서명 DB·루프백 제한 |
| 18 | 수정 | `infra/compose.atms.yml` | 운영 내부 검사 서비스·환경/볼륨 |
| 19 | 수정 | `infra/secrets/compose.env.example` | 운영 저장/검사 변수·placeholder |
| 20 | 생성 | `server/tests/evidence-validation.test.ts` | metadata/multipart/형식/크기 경계 검증 |
| 21 | 생성 | `server/tests/evidence-foundation.test.ts` | API·역할/회사·동시 등록/실패·정리/감사 |
| 22 | 생성 | `server/tests/evidence-storage.test.ts` | 실제 R2/ClamAV와 격리 시험 영역·실패/복구 |
| 23 | 수정 | `server/tests/database-foundation.test.ts` | 기존 모델/개발 데이터 보존·새 FK/유일성 |
| 24 | 수정 | `server/tests/audit.test.ts` | 새 허용 이벤트·개인/파일 정보 미노출 |

담당 문서7개는 이번 준비와 이후 승인값/구현 결과 기록에 사용한다: 이 문서, `03-evidence-storage-design.md`, `03-evidence.md`, `../README.md`, `../ROADMAP.md`, `../IMPLEMENTATION_PLAN.md`, `../PROJECT_DECISIONS.md`. 하위 규칙 상세는 이 문서와 P-07 원본에 두고 다른 문서는 링크/상태만 관리한다.

## 승인 후 구현 검증 조건8개

아래는 승인한 완료 조건이다. 첫 실행의8조건은7FAIL/1UNVERIFIED이며 완료되지 않았다. 개별 판정과 실제 시험 결과는 아래 실행 기록을 따른다. 기존 문서 준비4PASS는 기능 검증으로 재사용하지 않는다.

1. 입력 경계: strict metadata/query·실제 날짜·유니코드/파일명·UUID·다중/중복 필드·10MiB 전후·본문/metadata 제한·MIME/구조 불일치의 행동 시험.
2. 권한:5역할/겸임·다른 회사·현재 세션/소속/역할 회수·Origin/CSRF·외부 I/O 후 권한/거래처 변경·GET 활동 미연장/세션 보존.
3. 검사: 실제 ClamAV 정상 파일/EICAR 시험·이상/시간 초과/오류/크기 제한/서명 미갱신 시 완료 금지·검사 우회 없음.
4. 등록/재시도: 동일 ID/동일 내용1증빙·감사1, 타 소유자/다른 내용409·동시 요청·진행 상태 조회·응답 유실/명시적 재시도·EXPIRED 재사용 금지.
5. 장애/정리: 각 I/O/DB 실패·프로세스 중단·24시간 경계·활성/완료 제외·다중 작업자/완료 경합·삭제 실패·늦은 I/O 조정·추적 키 보존.
6. 조회/원본/감사: 완료만 목록/검색/커서/상세·다른 회사404·원본 바이트/지문/헤더·no-store·키/서명 URL 미노출·민감 내용 로그/감사 미노출.
7. 실제 저장/DB: 전용 실제 R2 시험 영역 Put/Get/Head/Copy/소유 임시 Delete·비공개/API 원본 접근·바이트 일치, Prisma/SQL FK·유일성·완료 보존, 기존 정상 DB 전후 스냅샷 보존. 시험 후 자기 시험 namespace/DB/프로세스만 정리한다. 시험 픽스처 제거 권한은 별도 시험 영역에만 적용하며 업무 원본 삭제 기능이 아니다.
8. 전체 회귀/보존: 서버 시험1작업자·서버 타입/빌드부터 완료한 뒤 프런트 build/lint·Appearance·기존 E2E를 묶어 실행한다. 직전 기준 API502/21파일·Appearance16·E2E203은 과거 기록이며 새 결과의 실제 이름/개수/exit를 기록한다. 승인 전 보호 소스/직전 결과/실패 기록과 AUTH10·P/F/G(P-07 외 보존)를 비교하고 상위 전체 체크를 유지한다.

실제 R2 환경이 없으면7번은UNVERIFIED다. 가짜 저장소 통과로 바꾸지 않으며 필수 비통과가 남으면 구현 완료를 보고하지 않는다. 첫 검증에서 비통과 합계가2개 초과면 수리를 중단하고 가장 앞선 실패 계층을 보고한다.2개 이하면 원인 수리 후8조건 전체를 다시 실행한다. 정상 개발 API/DB에서 대량 권한 실패 시험을 실행해 기존 감사 기록을 오염시키지 않는다.

## 확정 전 제안 준비의 검증 조건4개 — 과거 기록

1. D1~D5 실제 값·확정일/근거/영향을 기록하고 P-07만 체크한다. 사전 결정10개 중6완료/4미완료와 F03 구현 전을 대조한다.
2. E1~E8·API5·수동 구현/설정/시험24파일·미래 검증8조건을 세고 수정 파일의 현재 존재/생성 파일의 부재·기존 권한·현재 증빙 모델/API 부재를 대조한다.
3. 준비 전491개 파일 해시·P/F/G139의 P-07 외 동일·AUTH10·직전 준비/구현/실패 증거를 보존한다. 코드/설정/DB를 변경하지 않는다.
4. 변경 문서7개의 UTF-8/로컬 링크·공식 공개 문서3개 HTTP 상태·현재 UI/API 응답을 확인한다. 실제 R2 인증/ClamAV/미래 업로드는 이번 문서 준비의 완료 조건이 아니다.

당시 명령: `node .artifacts/proposal-f03-evidence-foundation/verify.cjs`. [과거 준비 결과](../../.artifacts/proposal-f03-evidence-foundation/results.json)와 [이전 정책 제안 결과](../../.artifacts/proposal-f03-evidence-storage/results.json)는 보존하며 현재 구현 상태에서 재실행하지 않는다. 원격 Hindsight는 기존30분 예약에 맡기며 최신 동기화는 이번 검증 범위 밖이다.

## 첫 구현 검증과 중단 기록 — 2026-10-06

승인된24파일을 작성했다. 원본/예약 관계는 [schema.prisma](../../server/prisma/schema.prisma)의 Evidence/EvidenceUpload, 회사 FK·불변 원본 trigger는 추가 migration이다. 최초 스키마는 PhpStorm 실행 파일에 경로를 전달해 열기 명령을 실행했다. `src/lib/api.ts`/화면과 정상 DB/기존 API 프로세스는 변경하지 않았다.

실행 흐름은 [controller](../../server/src/evidence/evidence.controller.ts) guard 이후 [multipart 입력](../../server/src/evidence/evidence-file-validation.ts) → [service.register](../../server/src/evidence/evidence.service.ts)의 현재 권한·예약 → [ClamAV](../../server/src/evidence/evidence-scanner.service.ts) → [R2 SDK](../../server/src/evidence/evidence-storage.service.ts) → 완료 직전 재검사/DB·감사 커밋이다. [cleanup](../../server/src/evidence/evidence-cleanup.service.ts)은 예약을 잠그고24시간 지난 미완성과 늦은 파일 생성만 추적 정리하도록 작성했다. 이 흐름은 작성한 코드의 설명이며 첫 입력 단계 실패로 전체 성공 동작을 검증하지 못했다.

서버 `npm --prefix server run build`는 Prisma 생성/tsc 종료0다. 직접 의존성은 AWS SDK3.1146.0·Busboy1.6.0(스트림 multipart 분리)과 타입 선언1.5.4다. 공식 ClamAV1.4.6_base를 다이제스트90effb795234e6a93b070310a4bab5a58d93d94b9a077a09ce2229947679782b로 고정했다. 전용 atms-dev-clamav-1 컨테이너 healthy·실제 정상 내용/EICAR 거부·잘못된 응답/오류/서명 미갱신/크기/시간 초과 거부의7시험은PASS다. 이를 HTTP 업로드 완료 검증으로 확대하지 않는다.

전체 서버 시험은 `node .artifacts/implementation-f03-evidence/run-command.cjs api server node_modules/vitest/vitest.mjs run --maxWorkers=1 --reporter=default --reporter=json --outputFile=../.artifacts/implementation-f03-evidence/api-results.json`이다.24파일/585시험 중537PASS·24FAIL·24SKIP, 종료1이다. database-foundation은 seed 실행 단계에서 실패해22시험을 실행하지 못했고 실제 R2 환경이 없어 객체/API 시험2개가SKIP이다. [원본 실행 결과](../../.artifacts/implementation-f03-evidence/repair-01/api-results.json)와 [첫8조건 결과](../../.artifacts/implementation-f03-evidence/first-results.json)를 보존했다.

| 조건 | 상태 | 구체적 근거 |
| --- | --- | --- |
| 1 입력 경계 | FAIL | validation/등록3시험 실패: 정상 multipart400, PNG fixture 구조 검사 실패 |
| 2 권한·세션 | FAIL | V2의7시험이 정상 등록400으로 기대한 완료/재검사 경로에 도달하지 못함 |
| 3 검사·실패 거부 | FAIL | 실제 ClamAV7시험PASS, HTTP V3의2시험은 검사 전에400으로 실패 |
| 4 중복·재시도 | FAIL | V4의4시험 실패, 입력 거부로 중복/진행/재시도 흐름 미검증 |
| 5 장애·정리 | FAIL | V5의5시험 실패, 입력 거부 및 삭제 실패 주입이 다른 예약에 적용됨 |
| 6 조회·원본·감사 | FAIL | V6의2시험이 완료 증빙 부재로 실패; 고정 감사 필드 시험은PASS |
| 7 실제 저장·DB | UNVERIFIED | R2 설정 없음/2시험SKIP·DB seed 준비 실패/22시험 미실행 |
| 8 전체 회귀·보존 | FAIL | 서버 시험 종료1·기존 모듈 연결 시험1실패; 후속 프런트 검증은 미진행 |

가장 앞선 업무 실패 계층은 **multipart 입력 어댑터**다. `evidence-file-validation.ts:48`의 parts2와72줄의 partsLimit 거부가 원인이다. Busboy 소스548~549줄은 `++parts === partsLimit`에서 이벤트를 발생시킨다. 정상 metadata1개+file1개도400이 되어 여러 후속 시험이 함께 막혔다. 이 계층을 먼저 수리해야 하며 검사/중복/감사 등의 개별 증상만 수정하지 않는다.

별도 준비 문제도 기록한다: PNG fixture의 CRC/구조를 조사하고 검증을 임의로 약화하지 않는다. 삭제 실패 시험은 해당 예약 키에 정확히 실패를 주입해야 한다. DB seed의 하위 명령 실패 원인은 안전한 진단 전까지 미확인이다. 기존 `server/tests/api-contract.test.ts:248`의 정확한 모듈 목록에는 새 EvidenceModule이 없어서 회귀1시험이 실패했다.

482보호 파일 해시·P/F/G139·AUTH10은 승인 전과 동일, 정상 기본DB21테이블 전후 해시 동일·자기 시험DB 제거·기존UI/API200을 확인했다. 이전 실행 증거는 `prior-evidence`에 복사해 회귀 실행과 구분했다. 서버 실패 뒤 다음 프런트 build/lint/Appearance/E2E 단계로 진행하지 않았다. 실제 R2 접근/운영 동작·DB 제약/seed·전체 증빙 성공·최신 원격 Hindsight는 미검증이며 F03 기능 체크는 유지한다.

**중단 근거:** [AGENTS.md](../../AGENTS.md)의 “첫 검증에서 FAIL과 UNVERIFIED의 합이 2개를 넘으면 수리를 멈추고 실패를 일으킨 가장 앞선 과정 또는 계층을 보고한다.” 규칙이다.8조건 중8비통과로 수리를 중단하고 [현재 결과](../../.artifacts/implementation-f03-evidence/results.json)를 기록한다. 입력 계층/검증 준비 수리와 전체8조건 재검증을 다음 재개 범위로 제시한다.

추가 파일 제안: `server/tests/api-contract.test.ts`1개, 목적은 기존 모듈 연결 시험에 승인된 EvidenceModule을 포함하는 것이다. 수동 구현/설정/시험 파일 수24→25의 변경안이며 아직 승인/수정하지 않았다. E1~E8/P-07 값과 API5개는 유지한다. [상태 기록 검증](../../.artifacts/implementation-f03-evidence/status-record-results.json)은 기능8조건과 별도다.

## 입력·시험 준비 수리 재개 확정 — 2026-10-06

사용자가 “입력·시험 준비 계층 수리와 회귀시험 api-contract.test.ts 1파일 추가(24→25)로 재개할까요?”라는 구체적 변경안에 `확인`(schema.prisma 참조)으로 동의했다. 영향 작업은 F03 증빙 서버 기반이다. 기존24파일과 모듈 연결 회귀시험1파일을 합한25파일 범위를 승인했으며 E1~E8, P-07 D1~D5와 API5개는 유지한다. 위 ‘미승인’ 문장은 첫 중단 당시의 기록이며 이 확정으로 대체된다.

수리 대상은 multipart 입력 어댑터의 Busboy 한도 이벤트 처리, PNG 픽스처, 특정 예약에 대한 정리 실패 주입, 격리 seed 실행 준비, 새 EvidenceModule 연결 회귀다. 스키마의 회사 연결/완료 원본 보존 정책은 변경하지 않는다. 먼저 실패 원인을 재현하고 이 문서의 동일8조건 전체를 다시 실행한다. 이전 첫 실패와 실행 로그는 `implementation-f03-evidence/repair-01`에 복사해 보존한다. 현재 상태는 **재검증 실패로 수리 다시 중단**, 기능 완료가 아니다.

## 수리 첫 재검증과 중단 — 2026-10-06

원인은 [진단 결과](../../.artifacts/implementation-f03-evidence/repair-diagnosis.json)로 확인했다. PNG IDAT 저장 CRC4019858807은 Node zlib.crc32의4020414299와 달랐다. 검증기를 약화하지 않고 픽스처만 수정했다. 격리 DB11개 migration은 종료0, Prisma seed는 PATH의 tsx 부재로 종료1, 설치된 tsx 진입점으로 같은 seed 실행은 종료0이었다. 진단용 자기 DB만 제거했다.

수정한5파일: evidence-file-validation.ts:48은 세 번째 part에서 거부하고 fields/files 각각1개를 유지한다. evidence-validation.test.ts:57은 파일 먼저·정확한10MiB/8KiB 입력과 세 번째 항목 거부,64줄은 PNG CRC 손상 거부를 추가했다. database-foundation.test.ts:38은 설치된 tsx 경로로 같은 seed의 안전 검사를 실행한다. evidence-foundation.test.ts:224는 정리 실패를 해당 예약에 한 번만 주입한다. api-contract.test.ts:23은 EvidenceModule 연결을 검증한다. 스키마와 완료 원본 보존 SQL은 이번 수리에서 수정하지 않았다.

Prisma 생성과 서버 tsc는 각각 종료0다. 동일 전체 서버 명령의 재실행은24파일/587시험 중584PASS·1FAIL·2SKIP, 종료1이다. [재검증 실행](../../.artifacts/implementation-f03-evidence/repair-01/first-recheck/api-results.json)과 [재검증8조건](../../.artifacts/implementation-f03-evidence/repair-01/first-recheck/results.json)은 별도 보존했다. 최초585시험 결과는 repair-01/api-results.json에 보존했다.

| 조건 | 상태 | 구체적 근거 |
| --- | --- | --- |
| 1 입력 경계 | PASS | 입력/HTTP 등록47시험, 정상 두 part·10MiB/8KiB 경계·손상 CRC 포함 |
| 2 권한·세션 | PASS | V2의13시험: 역할/회사/Origin/CSRF·I/O 후 재검사·세션 보존 |
| 3 검사·실패 거부 | PASS | V3의8시험, 실제 ClamAV 정상/EICAR 및 실패 응답 거부 |
| 4 중복·재시도 | FAIL | V4 비활성 거래처 재요청1시험: 상세 응답의 evidence 속성 부재 |
| 5 장애·정리 | PASS | V5의6시험: I/O/감사 실패·24시간 경계·삭제 실패/완료 원본 보존 |
| 6 조회·원본·감사 | PASS | V6 및 고정 감사 필드4시험 |
| 7 실제 저장·DB | UNVERIFIED | DB22시험PASS; 실제 R2 변수4개 부재로 객체/API2시험SKIP |
| 8 전체 회귀·보존 | FAIL | 전체 API 종료1; 서버 실패로 프런트 build/lint·Appearance/E2E 미진행 |

남은 가장 앞선 실패 계층은 HTTP 상세 응답 계약이다. 위 API4의 승인값은 { evidence }지만 evidence.controller.ts:33은 증빙 객체를 직접 반환한다. 시험201줄의 data.evidence.counterpartyId가 TypeError를 냈다. 다음 수리안은 controller.detail 응답을 승인값으로 감싸고 응답 계약 행동 시험을 보강하는 것이다. 이번 중단 뒤 이 코드는 수정하지 않았다. 첫 재검증 스냅샷의 소스 줄 표기36~38은 현재33줄로 정정하며 원본 기록은 보존한다.

보호481파일 해시·P/F/G139·AUTH10과 정상 DB21테이블 전후 동일·자기 시험 DB 제거·기존UI/API HTTP200을 확인했다. 추가 승인한 api-contract 파일의 종전 해시는 repair-baseline에 기록했다. 상위 F03 체크는 유지한다.

재중단 근거는 [AGENTS.md](../../AGENTS.md)의 비통과2개 초과 중단 규칙이다. 새 첫 재검증도2FAIL+1UNVERIFIED=3개이므로 수리를 멈췄다. 실제 R2는 server/.env에 계정/버킷/자격 증명을 직접 설정해야 하며 비밀값을 채팅에 보내지 않는다. 서버 전체 성공 전에는 브라우저 연결/후속 검증을 진행하지 않는다. 최신 원격 Hindsight 동기화는 이번 범위 밖이다.

## 상세 응답 계약 수리 재개 확정 — 2026-10-06

사용자가 “상세 응답을 승인된 { evidence } 형태로 수정하고 전체 재검증으로 재개할까요?”라는 구체적 변경안에 `확인`(api-contract.test.ts 참조)으로 동의했다. 영향은 F03 상세 조회 서버 계약이다. 기존25파일 범위 안에서 evidence.controller.ts의 detail 응답과 evidence-foundation.test.ts의 상세 응답 행동 검증을 수정한다. 지정한 api-contract.test.ts는 기존 모듈 연결 회귀를 유지하고 IDE 열기 명령을 실행한다. P-07/E1~E8/API5와 스키마는 변경하지 않는다.

수리 전 검증 조건은 위 동일8조건이다: 입력 경계, 권한·세션, 실제 검사·실패 거부, 중복·재시도, 장애·정리, 조회·원본·감사, 실제 R2·DB, 전체 회귀·보존. 서버 build/전체 API를 먼저 실행하고 통과하면 프런트 build/lint·Appearance16·기존 E2E203을 실행한다. 실제 R2 부재는 계속7번 UNVERIFIED로 기록한다. 과거 첫 실패 및 직전 재검증은 repair-02에 보존하며 이번 결과와 구분한다. 현재 상태는 **7PASS/1UNVERIFIED·실제 R2 검증 대기**이며 F03 완료가 아니다.

## 상세 응답 계약 수리 실행 결과 — 2026-10-06

evidence.controller.ts:31의 detail을 async로 바꾸고35줄에서 현재 회사의 조회 결과를 기다린 뒤 { evidence }로 반환한다. 조회 실패는 기존 공통 오류 처리로 전달한다. evidence-foundation.test.ts:240은 실제 HTTP200의 바깥 키1개·공개11필드·등록 결과와 동일·no-store를 검증한다. 비활성 거래처 재요청/타 소유자 요청 숨김도 이제 통과했다. api-contract.test.ts의44시험은 통과했고 이번 수정 없이 보존했다.

같은 전체 서버 명령은24파일/587시험 중585PASS·0FAIL·2SKIP, 종료0이다. Prisma generate/서버 tsc/프런트 build/lint는 각각 종료0, Appearance16/E2E203 모두PASS다. 기존 UiIcons.tsx의 lint 경고1건과 Vite 번들 크기 경고는 유지한다. 이번 변경은 컨트롤러/행동 시험2파일이며 스키마·P-07/E1~E8/API5·기존 브라우저 소스는 유지했다.

| 조건 | 상태 | 근거 |
| --- | --- | --- |
| 1 입력 경계 | PASS | 47시험 PASS |
| 2 권한·세션 | PASS | 13시험 PASS |
| 3 검사·실패 거부 | PASS | 8시험 PASS |
| 4 중복·명시적 재시도 | PASS | 4시험 PASS |
| 5 장애·정리·경합 | PASS | 6시험 PASS |
| 6 조회·원본·감사 | PASS | 4시험 PASS |
| 7 실제 저장·DB 제약 | UNVERIFIED | DB22시험PASS; R2 설정 없음으로 객체/API2시험 미실행 |
| 8 전체 회귀·보존 | PASS | 서버/프런트 build·lint 종료0, API585/Appearance16/E2E203, 보존 비교 |

[현재8조건](../../.artifacts/implementation-f03-evidence/results.json)과 [전체 API](../../.artifacts/implementation-f03-evidence/api-results.json), [브라우저 결과](../../.artifacts/implementation-f03-evidence/e2e-results.json)를 참조한다. 최초 실패는 repair-01/first-results.json, 직전5PASS/2FAIL/1UNVERIFIED는 [repair-02 기록](../../.artifacts/implementation-f03-evidence/repair-02/results.json)에 보존했다.

보호481파일/P-F-G139/AUTH10·정상 DB21테이블 전후 동일·자기 시험 DB 제거를 확인했다. 이전 브라우저 증거492파일을 보존하고 새 결과는 [브라우저 보존 기록](../../.artifacts/implementation-f03-evidence/repair-02/browser-preservation.json)에 분리했다. 원격 Hindsight 최신 동기화는 이번 검증 범위 밖이다.

필수7번만 UNVERIFIED로 남아 전체 증빙 서버 완료를 보고하지 않는다. 비공개 시험 버킷의 R2_ACCOUNT_ID/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY를 server/.env에 직접 설정한 뒤 실제 저장/등록/다운로드와 전체8조건을 재검증해야 한다. 비밀값은 채팅에 보내지 않는다. 새 증빙 화면/미리보기·전표 연결은 후속 범위다.

## 실제 R2 환경 설정과 검증 재개 — 2026-10-06

사용자가 `설정완료`(server/.env 참조)로 요청한 R2 시험 설정 준비를 알렸다. 변수4개 존재와 설정 형식 유효를 값 출력 없이 확인했다. 이는 실제 연결 성공 판정이 아니며 기존 E8의 실제 객체/API 검증과 동일8조건 재실행을 진행한다. 사용자에게 다시 같은 실행 승인을 요청하지 않는다. 영향은 F03 첫 증빙 서버 검증이며 업무 정책/스키마/25파일 구현은 변경하지 않는다.

기존 server/.env의 보호 해시는 사용자 설정 변경으로 달라졌으므로 예외 근거와 전후 해시만 r2-baseline에 기록한다. 자격 증명 원문은 복사/출력하지 않고 나머지480보호 파일·P/F/G139·AUTH10과 정상 DB 전후를 비교한다. 과거7PASS/1UNVERIFIED 및 첫 실패 기록은 r2-validation/기존 보존 폴더에 유지한다.

검증 조건은 기존8개: 입력 경계, 권한·세션, 실제 검사·실패 거부, 중복·명시적 재시도, 장애·정리·경합, 조회·원본·감사, 실제 R2·DB 제약, 전체 회귀·보존이다. 난수 시험 namespace의 Put/Head/Copy/Get와 바이트/지문 대조·실제 HTTP 등록/원본 다운로드·자기 시험 파일 제거를 실행한다. 서버 build/전체 API 이후 프런트 build/lint·Appearance16/E2E203을 재실행한다. 기존 정상 DB reset/업무 원본 삭제/새 버킷 생성은 하지 않는다. 현재는 **6PASS/2FAIL·R2 환경 확인 대기**이다.

## 실제 R2 첫 실행·재시도 결과 — 2026-10-06

사용자 설정 이후 변수4개 존재/형식 유효를 비밀값 출력 없이 확인하고 기존25파일 구현을 그대로 검증했다. Prisma generate/서버 tsc는 각각 종료0이다. 기존 전체 서버 명령은24파일/587시험 중585PASS·2FAIL·0SKIP, 종료1이다. 가짜 저장소 성공을 실제 저장소 성공으로 보고하지 않았다.

실패는 V7 객체 Put/Head/Copy/Get 시험과 실제 HTTP 등록/원본 다운로드 시험2개다. 저장소 put과 자기 시험 파일 제거가503으로 실패했다. afterAll 제거 실패로 storage-evidence.json이 갱신되지 않아 남은 종전 파일은 과거 증거다. 이번 실제 ClamAV 성공은 현재 Vitest의 정상/EICAR 시험으로 판정하며 과거 storage 보고서의 값을 재사용하지 않는다. 실제 파일 정리 성공은 확인되지 않았다. DB22시험은PASS이고 정상 DB21테이블 전후 동일·자기 시험 DB 제거를 확인했다.

- 1 입력 경계: PASS — 47시험
- 2 권한·세션: PASS — 13시험
- 3 검사·실패 거부: PASS — 8시험
- 4 중복·명시적 재시도: PASS — 4시험
- 5 장애·정리·경합: PASS — 6시험
- 6 조회·원본·감사: PASS — 4시험
- 7 실제 저장·DB 제약: FAIL — 실제 R2 객체/API2시험 실패
- 8 전체 회귀·보존: FAIL — 전체 서버 종료1, 프런트 후속 묶음 미진행

비밀값/버킷명/엔드포인트/예외 원문 없이 HeadBucket과 난수 빈 namespace의 ListObjectsV2만 조회했다. [첫 진단](../../.artifacts/implementation-f03-evidence/r2-validation/first-real-recheck/diagnostic.json)은 HTTP404/NotFound·HTTP404/NoSuchBucket이다. 사용자 “다시해봐”(evidence-foundation.test.ts 참조) 후 [현재 조회 재시도](../../.artifacts/implementation-f03-evidence/r2-validation/diagnostic.json)도 같은 결과였다. .env의 해시는 첫 실제 실행과 같았다. 설정 계정/기본 관할 endpoint의 해당 버킷을 찾지 못하는 것이 관측된 원인이다. 실제 이름/소속 계정·EU/US 등 관할이 맞는지는 사용자 확인이 필요하며 어떤 값이 틀렸다고 단정하지 않는다.

[현재8조건](../../.artifacts/implementation-f03-evidence/results.json), [첫 실제 실행](../../.artifacts/implementation-f03-evidence/r2-validation/first-real-recheck/api-results.json)과 [보존한 직전7PASS/1UNVERIFIED](../../.artifacts/implementation-f03-evidence/r2-validation/results.json)를 구분한다. 코드/스키마/업무 정책 변경은0개이고 .env 변경은 사용자 설정 근거와 전후 해시만 보존했다. 보호480파일/P-F-G139/AUTH10은 유지했다. 비통과2조건으로 초과 중단 게이트는 발생하지 않았으나 환경 원인 해결을 기다린다. 현재 연결이 계속 실패하므로 같은 전체 시험을 반복하지 않았다. 수정 후 동일8조건 전체를 다시 검증한다.

미검증: 실제 R2 등록·다운로드/정리 성공, 이번 실패 뒤 프런트 build/lint·Appearance/E2E, 최신 원격 Hindsight 동기화. 브라우저 연결과 상위 F03 완료로 진행하지 않는다.

## 실제 R2 연결 수정 후 전체 검증 완료 — 2026-10-06

사용자 재실행 지시 다시해봐(server/.env 참조)를 근거로 변경된 환경을 읽었다. [현재 조회 진단](../../.artifacts/implementation-f03-evidence/r2-validation/diagnostic.json)은 HeadBucket HTTP200이며 읽기 전용이다. 사용자 설정값은 출력하거나 복사하지 않고 승인 근거·해시만 기록했다. 이번 재검증에서 업무 구현25파일 변경은0개다. 이전404는 [첫 실제 실패 진단](../../.artifacts/implementation-f03-evidence/r2-validation/first-real-recheck/diagnostic.json)에 보존했다.

기존 동일8조건을 모두 다시 실행했다. Prisma generate·서버 tsc 종료0 이후 전체 API24파일/587시험 모두PASS, FAIL/SKIP0·종료0다. 이어 프런트 build/lint 종료0·Appearance16·E2E203 PASS를 확인했다. lint의 기존 미사용 disable 주석 경고1개와 Vite의 기존 큰 청크 경고는 유지되며 오류는0개다.

- 1 입력 경계: PASS — 47시험
- 2 권한·세션: PASS — 13시험
- 3 검사·실패 거부: PASS — 8시험
- 4 중복·명시적 재시도: PASS — 4시험
- 5 장애·정리·경합: PASS — 6시험
- 6 조회·원본·감사: PASS — 4시험
- 7 실제 저장·DB 제약: PASS — 24시험
- 8 전체 회귀·보존: PASS — 서버587·Appearance16·E2E203 및 보존 검증

실제 R2 Put/Head/Copy/Get·바이트/지문 대조·자기 시험 객체 제거와 실제 HTTP 증빙 등록/원본 다운로드·동일 요청 재등록을 확인했다. 실제 ClamAV의 정상 파일/EICAR 거부도 통과했다. [저장소 근거](../../.artifacts/implementation-f03-evidence/storage-evidence.json)와 [DB/API 근거](../../.artifacts/implementation-f03-evidence/database-evidence.json)는 이번 실행에서 갱신됐으며 자기 시험 파일과 격리 DB 제거 성공을 기록한다. 시험 영역 제거는 업무 원본 삭제 기능이 아니다.

보호480파일 해시·P/F/G139상태·AUTH10행·정상 DB21테이블 전후 동일·사용자 환경 해시를 보존했다. [브라우저 보존 근거](../../.artifacts/implementation-f03-evidence/r2-validation/browser-preservation.json)에 기존 파일 복원 수와 이번 새 증거의 별도 보관 경로를 기록했다. [8조건 결과](../../.artifacts/implementation-f03-evidence/results.json), [API 실행 결과](../../.artifacts/implementation-f03-evidence/api-results.json), [E2E 실행 결과](../../.artifacts/implementation-f03-evidence/e2e-results.json)를 참조한다. 첫 실패와 각 중간 재검증은 별도 디렉터리에서 유지한다.

E1~E8의 첫 서버 작업 단위는 검증 완료다. 증빙 브라우저 등록/조회/미리보기와 전표 연결·원장/보고서 경로는 후속이며 기존 E2E203을 새 증빙 화면 검증으로 해석하지 않는다. 정상 개발 DB에 새 migration을 적용하거나 기존 개발 API를 재시작하지 않았다. 상위 F03 체크는 유지한다.

이번 범위 밖 미검증: Cloudflare 관리 화면의 공개 도메인/버킷 공개 설정, 운영 자원·성능/백업·복원, 최신 원격 Hindsight 동기화. 실제 인증된 S3/API 시험 성공으로 이 항목들의 검증을 대신하지 않는다.
