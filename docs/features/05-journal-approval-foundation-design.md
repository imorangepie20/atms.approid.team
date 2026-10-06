# 전표 승인 요청·승인·반려 첫 묶음 제안

작성일: 2026-10-07. 상태: **W1~W8의 승인 요청·승인·반려 첫 서버 묶음 부분 완료**.

최종 검증(2026-10-07): [K1~K8 결과](../../.artifacts/proposal-f05-journal-approval/results.json) 모두 PASS. 첫 전체 검증은 K7의 시험 타입 표기/검증 명령 대상 버전 때문에 FAIL 1건이었으며 [첫 결과](../../.artifacts/proposal-f05-journal-approval/first-results.json)를 보존한다. 원인을 수정해 전체를 재검증했고, SQL 이력 연결과 초안 고정 식별 필드의 직접 변경 제한을 추가 확인한 뒤 전체를 다시 통과했다. 서버 774/774, 화면 157/157, Appearance 16/16, 빌드·타입·스키마·린트 종료0. 보호 파일284·정책4(담당 승인 문서 제외)·계획 체크139행·과거 산출물14개의 원본 바이트를 보존했다. 격리 DB만 사용했고 기본 DB 전후 행 지문은 서버 시험에서 동일했다. 운영 반영과 Hindsight 최신 원격 반영은 별도로 확인하지 않았다. F04/F05 상위 체크는 유지한다.

사용자 확정 근거: 2026-10-07, W1~W8과 원장 전 승인 기초의 순서 조정을 모두 제시한 뒤, 사용자 “확인”(src/lib/api.ts 지정). 영향 작업: F05-01·02·03·07의 승인 부분, F04-05·06·07의 상태 호환, F08-13 감사. K1~K8은 구현 후 별도로 검증한다.

[문서 인덱스](../README.md) · [구현 계획](../IMPLEMENTATION_PLAN.md) · [승인과 마감](05-approval-closing.md) · [전표와 원장](04-journals-ledger.md)

## 확인한 선행 상태와 확정한 범위 조정

- P-01·P-02·P-03·P-04·P-10은 [구현 계획의 확정 기록](../IMPLEMENTATION_PLAN.md#사전-결정-체크리스트)에 선택값과 근거가 있다. 기존 회사 권한·본인 승인·금액 정책을 재사용한다.
- 직전 초안 화면 묶음의 [기록된 결과](../../.artifacts/implementation-f04-journal-browser/results.json)는 K1~K8 PASS다. 이는 과거 완료 증빙이며 현재 서버 응답을 재검증했다는 뜻이 아니다.
- 현재 `src/lib/api.ts`의 JournalSummary.status와 Prisma JournalStatus는 DRAFT만 허용한다. 기존 서버 목록·증빙 역조회도 DRAFT로 필터링한다. 현재 승인 기능은 없다.
- 계획서 F05의 선행 조건은 F01 권한과 F04 장부다. 장부에 반영할 확정 전표와 기초 잔액 승인에는 상태 흐름이 필요하다. **전체 원장보다 먼저 장부에 영향을 주지 않는 승인 기초만 만드는 순서 조정**을 사용자에게 제시하고 2026-10-07 “확인”으로 확정했다.
- 영향 작업: F05-01·02·03·07의 승인 부분, F04-05·06·07의 상태 호환, F08-13 감사. 상위 확정 순서의 API·DB·권한·규칙 버전 기반은 유지한다. 아래 묶음을 검증한 뒤 확정·원장·기초 잔액 설계를 별도로 제시한다.

## 확정값 W1~W8

아래 모든 행은 위 사용자 근거로 **확정**했다. 기존 확정 정책의 값을 변경하지 않는다.

| ID | 추천 선택값 | 동작과 영향 |
| --- | --- | --- |
| W1 | 먼저 승인 기초 서버를 구현하고, POSTED 확정·원장·마감은 후속 묶음으로 둔다 | 운영 DB 적용·배포·실제 업무 전표의 상태 변경은 이번 범위에 포함하지 않는다. 격리 시험 DB에서 검증한다. F04 장부 선행 조건에 대한 위 순서 조정을 함께 승인받는다. |
| W2 | 승인 1단계, 회사의 권한 있는 승인자들이 공유하는 작업 목록 | DRAFT → SUBMITTED → APPROVED. SUBMITTED → REJECTED → DRAFT. 승인 완료는 장부 확정이 아니다. 지정 승인자·복수 결재선·자동 승인·요청 취소·승인 취소는 이번에 만들지 않는다. APPROVED는 후속 확정 기능 전까지 읽기 전용이다. |
| W3 | 현재 역할 권한과 실행 시점의 회사 설정을 재사용 | 요청은 journal.request, 승인·반려는 journal.approve, 반려 후 초안 복귀는 journal.draft. 회사·활성 소속·세션·권한을 쓰기 트랜잭션 안에서 다시 확인한다. 승인·반려에는 현재 작성자와 allowSelfApproval 제한을 적용한다. 관리자도 예외가 아니다. 외부 세무사 단독 역할은 초안 작성만 가능하고 요청 권한은 없다. 겸임 권한은 기존 회사 내 합산을 따른다. 요청·초안 복귀에 새 작성자 전용 제한은 두지 않는다. |
| W4 | 제출 당시 내용 보존, DRAFT만 내용 수정 가능 | 제출할 때 현재 계정 사용 가능 여부·거래처·READY 증빙·기간·차대 균형을 재확인하고 전표/분개/증빙 식별자와 입력 내용의 제출본을 보존한다. 제출·승인·반려 상태에서 내용 변경은 409. 반려 사유는 trim 후 1~500 코드 포인트 필수. 반려 후 명시적으로 DRAFT로 복귀한 뒤 수정·재요청한다. 매 제출본과 사유는 회사 권한이 적용되는 업무 이력에 보관한다. |
| W5 | version과 actionRequestId(UUID)로 동시 처리·재요청 보호 | 본문은 version·actionRequestId, 반려만 reason 추가. 성공 전이마다 version+1, 상태/처리자/서버 UTC 시각/제출본 참조를 이력에 저장한다. 회사+actionRequestId와 정규화된 작업·전표·본문 해시를 유일하게 기록한다. 동일 요청 재전송은 이미 기록된 결과를 반환하고 새 전이/감사를 만들지 않는다. 다른 내용 또는 오래된 version은 409. 재전송에서도 현재 접근 권한을 확인한다. |
| W6 | 전이·요청 식별자·이력·감사를 같은 트랜잭션으로 저장 | 잠금 순서는 기존 세션→회사→소속/역할→전표 순서를 유지한다. 승인 설정 변경과 승인 실행의 경합을 회사 잠금으로 직렬화한다. SQL 제약과 트리거로 허용 전이·제출 후 내용 불변·이력 불변을 검증한다. 번호·작성자·분개 금액·증빙 원본은 상태 전이로 바뀌지 않는다. 일반 감사에는 정적 작업명·ID·상태·version만 남기고 반려 사유·적요·금액·파일 키는 넣지 않는다. |
| W7 | 기존 초안 5경로 유지, 공개 상태 타입과 읽기 전용 표시만 확장 | 기존 초안 목록·증빙 역조회는 DRAFT 필터 유지. 상세 및 생성 요청 재확인은 현재 상태를 반환하므로 api.ts 상태 타입을 4종으로 확장한다. 상세에 현재 상태를 표시하고 DRAFT가 아니면 수정 시작·충돌 복구 후 재수정·열려 있는 수정 폼의 제출을 차단한다. 서버도 상태를 다시 검사한다. 기존 승인 전 초안 동작과 J6 생성 중복 계약은 유지한다. 승인 작업 버튼·전용 목록 화면 연결은 다음 브라우저 묶음이다. |
| W8 | 기존 금액·규칙 버전 계약 유지, 승인 결과를 집계에 넣지 않는다 | 금액은 Decimal과 API 문자열, 회계일자는 DATE, 처리 시각은 UTC를 유지한다. 이 묶음에는 원장·재무제표·세무 계산이 없고 기초 잔액을 0으로 가정하지 않는다. POSTED·마감·역분개·정정·확정 보고서·실제 계산 규칙 선택은 후속 설계와 검증 대상이다. F04/F05 전체 완료 체크는 유지한다. |

승인 단계는 첫 버전 1단계로 확정했다. 회사별 복수 결재선은 이번 범위 밖이며, 필요할 때 별도 정책을 결정한다. 이 선택은 프로젝트 구현안이며 법정 의무라고 주장하지 않는다.

## 추가 서버 계약: 6경로

경로 앞에는 기존 `/api`를 붙인다. 읽기는 journal.read·no-store·회사 범위 확인, 쓰기는 기존 Origin/CSRF·활동 선언·회사 권한 확인을 적용한다. 서버가 권한·현재 상태에서 허용 작업을 계산하며 클라이언트가 작성자/상태/처리 시각을 지정하지 않는다.

| 방법 | 경로 | 내용 |
| --- | --- | --- |
| GET | /companies/:companyId/journal-approval-requests | status는 SUBMITTED/APPROVED/REJECTED, 기본 SUBMITTED. 회계연도/회계일자 기간/검색·20건 기본·최대100·UUID cursor. 회사 내 ID 오름차순과 커서 범위 검사. 조회 권한자가 읽을 수 있으며 처리 권한은 별도 검사. |
| GET | /companies/:companyId/journals/:journalId/workflow | 현재 전표 view·허용 작업·불변 제출본/전이 이력. 이력은 시간+ID 순서, 페이지 기본20·최대100. 일반 초안 상세에는 이력 본문을 추가하지 않는다. |
| POST | /companies/:companyId/journals/:journalId/submit | DRAFT → SUBMITTED. 현재 version과 전체 참조 자격 재확인. |
| POST | /companies/:companyId/journals/:journalId/approve | SUBMITTED → APPROVED. 승인 권한·현재 본인 승인 설정 적용. |
| POST | /companies/:companyId/journals/:journalId/reject | SUBMITTED → REJECTED. 승인과 같은 검토 권한, 반려 사유 필수. |
| POST | /companies/:companyId/journals/:journalId/return-to-draft | REJECTED → DRAFT. 기존 제출본·반려 사유 보존. |

새 쓰기는 성공200, 형식400, 미인증401, 접근 권한403, 다른 회사/없는 참조404, 상태/version/요청 충돌409, 기존 과다 요청429 및 안전한 공통 오류 계약을 사용한다. 동일 요청 재확인은 기록된 전이 ID·결과 상태·결과 version을 반환하며 현재 전표 view와 구분한다.

## 확정한 구현 파일과 시험 목록 보정: 19개

2026-10-07 사용자 “확인”에 따라 아래 목록을 구현한다. 추가 라이브러리·환경값·포트·권한 코드를 만들지 않는다.

| 번호 | 파일 | 목적 |
| --- | --- | --- |
| 1 | server/prisma/schema.prisma | 승인 상태·제출본·불변 전이·중복 요청 기록 모델과 회사 복합 FK |
| 2 | server/prisma/migrations/20261007020000_journal_approval_foundation/migration.sql | 기존13개 migration을 보존하는 추가 SQL, 상태·불변·감사 제약 |
| 3 | server/src/journals/journal-workflow.ts | 허용 전이·작업 본문 정규화·재요청 해시의 순수 함수 |
| 4 | server/src/journals/journal-workflow.schemas.ts | UUID/version/반려 사유·목록/이력 커서의 엄격한 입력 검증 |
| 5 | server/src/journals/journal-workflow.service.ts | 현재 권한·참조 재확인, 잠금·전이·제출본·재요청·이력·감사 |
| 6 | server/src/journals/journal-workflow.controller.ts | 추가 6경로, 권한 선언과 응답 계약 |
| 7 | server/src/journals/journals.module.ts | 기존 모듈에 서비스/컨트롤러 등록과 실패 응답 포함 no-store |
| 8 | server/src/audit/audit.service.ts | 승인 작업의 정적 허용 목록과 원자 감사 입력 검증 |
| 9 | src/lib/api.ts | JournalSummary.status 4종 확장. 새 승인 API의 브라우저 연결은 후속 |
| 10 | src/components/journals/JournalDetail.tsx | 상태 표시와 DRAFT 전용 수정 버튼 |
| 11 | src/pages/accounting/Journals.tsx | 최신 상태가 초안일 때만 수정 시작·복구·제출 허용 |
| 12 | tests/journals.test.tsx | 기존 초안 동작 및 승인 상태 상세/충돌 복구의 수정 차단 |
| 13 | server/tests/api-contract.test.ts | 새 경로·guard/CSRF·no-store·안전 오류 계약 |
| 14 | server/tests/audit.test.ts | 정적 감사 입력과 원자 롤백·민감한 사유 제외 |
| 15 | server/tests/journal-draft-foundation.test.ts | 기존 초안 생성 재확인·수정·번호/금액/증빙 불변과 상태 호환 |
| 16 | server/tests/journal-workflow-validation.test.ts | 전이·형식·사유·목록/이력 커서 경계 |
| 17 | server/tests/journal-workflow-foundation.test.ts | 격리 DB에서 상태·권한·제출본·경합·롤백·SQL 직접 변경 제한 |
| 18 | server/tests/access-policy.test.ts | 확정 역할표/권한 합산/본인 승인 경계 회귀 |
| 19 | server/tests/database-foundation.test.ts | 새 제출본·전이 이력 2테이블을 기존 migration 목록 검증에 반영. W1~W8 구현 중 확인한 필수 시험 목록 보정 |

설명 순서: 요청→입력 검증→현재 권한→트랜잭션/잠금→재요청 검사→전이/제출본→감사→응답. 보호 기준과 검증 스크립트는 `.artifacts`에 두며 구현 파일 수와 구분한다.

## 구현 후 완료 검증 K1~K8: 모두 PASS

| ID | 객관적 완료 조건 | 검증 근거 종류 |
| --- | --- | --- |
| K1 | 허용 4전이만 성공하고 APPROVED가 집계/확정으로 취급되지 않음 | 행동 시험명·통과 수, 상태/이력 DB 대조 |
| K2 | 5역할·겸임·회사 분리·현재 설정·작성자 분리·활성 소속 확인 | 권한/현재 설정 변경 시험 및 DB 경합 결과 |
| K3 | 제출본/분개/증빙 불변·반려 사유 보존·복귀 후 새 제출본 | snapshot 해시·행 수·SQL 직접 변경 거부 시험 |
| K4 | 같은 요청 재전송/동시 승인·반려에서 전이1회, 충돌409 | 병렬 HTTP 결과와 version/이력/감사 건수 |
| K5 | 감사 실패·참조 실패·SQL 위반 때 부분 상태/행이 남지 않음 | 강제 실패 시험·트랜잭션 전후 DB 비교 |
| K6 | 6경로의 상태 코드·CSRF/Origin·캐시·회사별 커서가 계약과 일치 | API 계약 시험과 정규화 입력 경계 시험 |
| K7 | 기존 초안 5경로·생성 재확인 및 비초안 화면 수정 차단 회귀 | 서버 전체/DOM/Appearance 일괄 시험, schema·타입·build·lint 종료0 |
| K8 | 기존 정책·139체크·과거 migration/완료 증빙·기본/운영 업무 데이터 보존 | 사전/사후 SHA256·SQL 기록/행 대조, 격리 DB만 적용/정리한 기록 |

위 표는 구현 전 정한 기준이다. 실제 실행 근거는 [결과 JSON](../../.artifacts/proposal-f05-journal-approval/results.json), [명령별 종료 코드](../../.artifacts/proposal-f05-journal-approval/commands.json), 서버·DOM 시험 결과 및 과거 산출물 복원 기록을 참조한다. 첫 검증의 비통과 1건은 타입 검사 계층에서 발생했다. 미실행 운영 DB 적용·배포·승인 화면, POSTED 확정·원장·기초 잔액·마감·정정은 이번 완료 범위 밖이다. Hindsight는 기존 30분 예약을 유지하며 이번 문서의 원격 반영은 확인하지 않았다.
