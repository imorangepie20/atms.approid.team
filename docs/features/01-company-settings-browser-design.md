# F01·F08 회사 본인 승인 설정 브라우저 화면

[문서 인덱스](../README.md) · [기존 설정 서버 계약](01-company-settings-design.md) · [본인 승인 정책](05-approval-closing.md#확정한-본인-승인-정책) · [직전 본인 접근 화면](01-company-self-access-browser-design.md) · [회사와 사용자 권한](01-company-access.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **사용자 확정·이번 설정 화면 부분 구현·검증 완료**. 제안일·확정일·완료일: 2026-10-06. 확정 근거: 사용자가 이 설계 문서를 지정하여 “확정”이라고 답했다. 아래 S1~S6 전체 선택값·파일 항목 10개·검증 조건 8개를 확정했다. 영향 ID: F01-01·F01-05·F01-06·F01-08 및 F08-09·F08-14·F08-15의 회사 설정 화면 부분. 서버/DB 정책 변경은 포함하지 않는다.

## 선행 근거와 다음 범위

필수 P-01·P-02·P-03·P-04·P-10과 확정한 구현 순서는 [계획서](../IMPLEMENTATION_PLAN.md#확정한-다음-구현-순서)를 재사용한다. 직전 본인 접근 화면은 [8개 조건 PASS](../../.artifacts/implementation-f01-company-self-access-browser/verification-results.json)로 완료했다. 이 기록은 직전 검증이며 이번 설정 화면의 실행 결과가 아니다.

이번 확정 묶음은 **기존 `/companies` 선택 회사의 본인 승인 설정 변경 화면**이다. 회사 기본 설정의 남은 기존 PATCH를 연결하는 범위이며 새 메뉴·서버·DB·전표 승인 기능은 추가하지 않는다. 가입/확인/복구 웹 화면·전체 기기 로그아웃 화면·중지 소속 재활성화·기간 정정·운영 SMTP는 후속이다. F01/F08 상위 전체 체크는 유지한다.

이미 확정한 정책은 다시 결정하지 않는다. 기본 금지, 해당 회사 관리자만 변경, 최근 5분 비밀번호 재확인, 회사 이름/회계연도와 공유하는 company.version, 최신 같은 값 no-op, 원자 감사, 역할·소속·현재/다른 기기 세션 보존, 승인 실행 시 현재 설정 적용은 [설정 서버 계약](01-company-settings-design.md)을 따른다. 설정 변경 자체로 승인 권한이 생기지 않으며 실제 전표 승인 API는 아직 후속 F04/F05다.

구현 착수 전 소스 근거(문서 준비 시점):

- `server/src/companies/companies.controller.ts:56`: `company.manage`·재확인·활동 선언의 전용 PATCH. 응답에서 세션 쿠키를 교체하지 않는다.
- `server/src/companies/companies.schemas.ts`: strict Boolean·양의 INTEGER version(최대 2147483647). 문자열 true/false나 과다 필드를 받지 않는다.
- `server/src/companies/companies.service.ts:112`: 잠금 뒤 현재 권한/재확인/version 검사, 같은 값 no-op, 실제 변경/version+1/감사 원자 저장.
- `server/tests/company-settings.test.ts`: 양방향 변경·비관리자/다른 회사·공유 version·재확인·감사 실패·세션 보존·실제 승인 기능과의 경계를 검사하는 기존 회귀.
- `src/components/companies/CompanyWorkspace.tsx`: 회사 응답의 본인 승인 허용/금지를 표시하지만 설정 변경 양식은 없다. `src/lib/api.ts`에도 해당 PATCH 연결은 아직 없다.

## 사용자 확정 선택값 6개

아래 S1~S6 전체를 사용자 “확정”(2026-10-06)으로 선택했다. 근거와 영향 ID는 첫머리에 기록하며 구현 완료 여부는 검증 결과와 구분한다.

| ID | 항목 | 확정 선택값 | 영향·제한 |
| --- | --- | --- | --- |
| S1 | 화면 위치·권한 | 기존 `/companies`의 선택 회사 작업 공간에 `본인 승인 설정` 카드. `company.manage`일 때만 변경 양식 표시 | 비관리자는 기존 요약의 현재 허용/금지만 조회한다. 새 라우트·Sidebar·Settings 템플릿 변경은 없다. 서버도 현재 권한을 다시 검사한다. |
| S2 | 값 선택·확인 | 현재 값과 `금지`/`허용` 라디오를 표시하고, 값이 달라졌을 때만 `변경 확인` 활성화. 확인 영역에 회사명/ID·현재→변경 값·company.version과 승인 권한 필수 안내 | 라디오 선택만으로 저장하지 않는다. 양방향 변경을 같은 절차로 처리하며 기본 금지를 유지한다. 같은 값은 일반 UI에서 제출하지 않고 서버 no-op 경계는 기존 회귀로 검증한다. |
| S3 | 재확인·비밀·포커스 | 확인 영역에서 현재 비밀번호를 입력하고 `설정 변경 실행`을 직접 제출. 비밀번호는 제출 즉시 입력란에서 삭제하며 매 재시도에 다시 입력 | 비밀번호를 Query mutation/cache·router state·저장소·로그에 넣지 않는 로컬 async 핸들러를 사용한다. 확인 제목으로 포커스 이동, Escape/돌아가기는 시작 버튼으로 복귀한다. 회사나 서버 version/설정이 바뀌면 확인 대상을 폐기한다. |
| S4 | 저장·중복·세션 | 제출 시 회사 ID/원래 version/목표 Boolean을 고정. 회사 선택·생성·이름/회계연도 변경·설정 저장은 진행 중에 중복 실행을 막음. 성공 응답으로 선택 회사 현재 값/version을 반영하고 목록 갱신 | 이전 회사의 늦은 응답은 새 선택 회사에 적용하지 않는다. 성공 안내 뒤 확인 입력을 닫는다. 세션/CSRF를 교체하거나 다른 기기를 로그아웃하지 않는다. 실제 저장/version/감사는 서버가 처리한다. |
| S5 | 충돌·접근 회수 | 409면 목표/확인을 폐기하고 기존 select API로 현재 값/version/권한을 다시 확인. 403/404면 오래된 작업 공간을 닫고 접근 가능한 회사 목록 갱신 | 다른 화면의 이름/기간 변경과 충돌해도 덮어쓰지 않는다. 재확인용 GET/select는 설정 PATCH를 실행하지 않는다. 비밀번호 401은 세션 GET으로 판별해 유효 세션은 유지하고 실제 만료만 인증/캐시를 정리한다. |
| S6 | 불명확한 결과·경계 | 400/429/503/연결 실패는 고정 안내, 자동 PATCH 재전송 없음. 저장 응답을 받지 못한 경우 `최신 회사 다시 확인`으로 현재 값/권한을 읽은 뒤 새 선택·비밀번호로 재시도 | 실패 응답만으로 저장 여부를 추측하지 않는다. 미확인 상태에서는 변경 실행을 다시 허용하지 않는다. 설정 관리만 검증하며 과거 전표 소급 변경·실제 전표 승인·세율/규칙 적용 완료를 주장하지 않는다. |

## 기존 API 1개와 입력·출력

| 메서드·경로 | 입력 | 출력 |
| --- | --- | --- |
| PATCH `/api/companies/:companyId/settings/self-approval` | `{ allowSelfApproval: boolean, version: number }`, 기존 쿠키·Origin/CSRF와 비밀번호 재인증 | 기존 CompanyView: id/name/currency/accountingStandard/allowSelfApproval/version. 교체 session 필드 없음. |

호출 예시는 `{ "allowSelfApproval": true, "version": 3 }`이다. 실제 ID/version은 확인 대상에서 가져온다. 현재 비밀번호는 먼저 기존 POST `/api/auth/reauthenticate`에 전달하고 설정 PATCH 본문에는 포함하지 않는다. 회사 목록/선택·세션 조회 API는 기존 연결을 재사용한다. 재인증 성공만으로 설정을 변경하지 않는다.

실제 변경은 version+1·`COMPANY_SELF_APPROVAL_CHANGED` 1개이고, 최신 같은 값은 저장/version/성공 감사 없이 반환한다. 오래된 version은 같은 값이어도 409이며 INTEGER 최댓값의 실제 변경도 409다. 이름·기간·다른 회사·사용자 역할을 설정 응답으로 바꾸지 않는다. 서버 감사 실패 rollback·현재 역할/세션/5분 경계는 기존 서버 회귀와 결합한다.

## 구현 파일 항목 10개

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `src/lib/api.ts` | 기존 CompanyView를 반환하는 설정 PATCH 1개 연결; Boolean/version만 제출 |
| 수정 | `src/pages/companies/CompanyManagement.tsx` | 로컬 재인증/저장 핸들러, 공유 변경 진행 상태, 성공 값/version 반영, 최신 선택/목록·401/403/404/409/불확실 결과 처리 |
| 수정 | `src/components/companies/CompanyWorkspace.tsx` | 관리자 전용 설정 카드 연결과 회사 변경 진행 중 이름/기간 버튼 상태 |
| 생성 | `src/components/companies/CompanySelfApprovalForm.tsx` | 현재 값/라디오·명시적 확인/비밀번호 입력·즉시 삭제·확인 폐기·키보드 포커스 |
| 생성 | `tests/e2e/company-settings.spec.ts` | 양방향/version·명시적 실행·권한/비밀번호/충돌/공유 변경·세션 유지·불확실 응답 후 조회·반응형 회귀 |
| 생성 | `.artifacts/implementation-f01-company-settings-browser/live-company-settings-check.cjs` | 실제 격리 DB에서 false→true→false·version/감사·역할/세션/다른 회사 보존과 기본 atms 전후 비교 |
| 생성 | `docs/features/01-company-settings-browser-design.md` | 선택값·확정 근거·구현 흐름·검증 증거 |
| 수정 | `docs/features/01-company-access.md` | 본인 승인 설정 화면 부분과 남은 계정/업무 경계 |
| 수정 | `docs/README.md`·`docs/ROADMAP.md` | 문서 인덱스와 제안/확정/부분 완료 상태 |
| 수정 | `docs/IMPLEMENTATION_PLAN.md` | 다음 제안·확정·검증 후 부분 완료 근거 |

첫 구현 파일 `src/lib/api.ts`부터 IDE에서 파일을 열고 입력/출력·실패 흐름을 설명한 뒤 확정 범위를 구현했다. 변경 목적 주석과 아래 코드 흐름으로 실제 구현 영역을 설명한다. 관련 변경을 묶어서 검증하며 서버/스키마/마이그레이션·권한표·공통 시간 설정·메일·패키지·실제 환경은 변경하지 않는다. 기존 E2E 파일은 보존하고 새 설정 테스트를 추가했다.

## 구현 후 검증 조건 8개

- [x] 선택값 6개·사용자 확정 근거/날짜/영향 ID·파일 항목 10개·기존 API 1개와 제외 범위를 기록한다.
- [x] 관리자만 변경 양식을 보고 비관리자는 현재 값만 조회한다. 회사 선택/라디오/확인 표시/재인증만으로 설정 PATCH가 발생하지 않으며 해당 회사 ID·Boolean·원래 version만 제출한다.
- [x] true/false 양방향과 응답 version+1·요약/목록 갱신을 확인한다. 일반 UI 동일 값 차단, 기존 API 최신 no-op·오래된 version·INTEGER 최대값과 이름/기간 공유 version 회귀를 확인한다.
- [x] 현재 비밀번호 재확인과 제출 즉시 삭제·cache/state/storage/log 제외, 잘못된 비밀번호 401 세션 유지/진짜 만료 재로그인 및 서버 5분 경계를 검증한다.
- [x] 회사 전환·공유 변경 중복 실행 차단/이전 응답 배제, 409 확인 폐기·현재 값/권한 재선택, 403/404 작업 공간 정리 및 400/429 안내를 검증한다.
- [x] 503/연결 실패 자동 재전송 없음·미확인 상태 변경 차단·최신 회사 조회 뒤 새 명시적 실행, 실제 설정/version/감사와 기존 현재/다른 기기 세션·CSRF/절대 만료·역할/다른 회사 보존을 확인한다.
- [x] label/fieldset/legend/status/alert·확인/복귀 키보드 포커스, 375/768/1440px 가로 넘침·스크린샷과 기존 회사/구성원/접근 화면 행동을 확인한다.
- [x] build·lint·전체 Appearance/E2E/API 회귀·실제 격리 DB의 설정/감사·기본 atms 무변경·실행 시점 UI/API readiness와 최신 소스·비밀번호/토큰 없는 증거를 확인한다. 실제 전표 승인 검증과 구분한다.

위 8개는 **실제 구현 후 전체 검증 묶음으로 모두 PASS**다. 아래 실행 증거로 확인하며 이전 문서 준비 검증으로 대체하지 않는다.

## 구현한 코드 흐름

1. [API 연결](../../src/lib/api.ts) 195행의 `changeSelfApproval`은 회사 ID를 URL에 넣고 Boolean/version만 JSON으로 보내 기존 CompanyView를 받는다. 비밀번호는 앞선 재인증 호출에만 사용한다. 공통 `requestJson`이 쿠키·CSRF·HTTP 실패 처리를 담당한다.
2. [설정 양식](../../src/components/companies/CompanySelfApprovalForm.tsx) 20행부터 현재 값, 선택값과 확인 대상을 로컬 state(화면 안의 임시 값)로 나눈다. 확인 버튼이 회사 ID/version/목표값을 고정하고, 40행 제출은 비밀번호를 복사한 뒤 입력 state를 즉시 비운다. 회사/version/설정 변경은 확인 대상을 폐기하며 확인 제목과 돌아가기 버튼의 포커스를 관리한다.
3. [회사 관리](../../src/pages/companies/CompanyManagement.tsx) 263행의 공유 진행 상태는 회사 선택·생성·이름·기간·설정 변경의 중복을 막는다. 298행 로컬 async 저장은 재인증→설정 PATCH→ID가 같은 현재 회사에만 응답 반영→회사 목록 갱신 순서다. 비밀번호를 TanStack Query의 mutation(요청 변수·결과를 보관하는 상태 관리)에 등록하지 않고, Query에는 비밀 없는 회사 목록 갱신만 요청한다.
4. 같은 파일 315행부터 잘못된 비밀번호 401은 세션 조회로 구분한다. 유효 세션은 유지하고 실제 만료만 로그인으로 돌린다. 409는 확인 양식을 새로 만들고 현재 회사·권한을 재선택한다. 403/404는 작업 공간과 회사별 조회 캐시를 정리한다. PATCH 응답 유실은 저장 결과 미확인 상태로 잠그며 `최신 회사 다시 확인`은 조회만 하고 PATCH를 자동 재전송하지 않는다.
5. [작업 공간](../../src/components/companies/CompanyWorkspace.tsx) 113행의 날짜 입력은 좁은 화면에서 세로로 배치하고, 회사 관리 365행 부근의 목록/작업 공간도 태블릿에서는 세로로 쌓는다. 선택 회사의 현재 본인 승인 요약은 기존 조회 영역에서 계속 표시하며 변경 카드는 `company.manage` 권한으로만 연결한다.

이번에 실제 연결한 기능은 회사 설정 변경이다. 작성자가 자기 전표를 승인하는 실행 API·전표 저장·마감·세무 계산은 이 코드에 추가하지 않았다.

## 이번 문서 준비의 객관적 검증 조건 4개

이하 준비 검증은 **화면 구현 전의 역사 기록**이다. 준비 당시의 표시 전용 상태·새 파일 부재·확정 대기 판단을 현재 구현 상태로 읽지 않는다. 당시 결과/해시는 보존하며 구현 후 현재 상태는 별도 검증 증거로 확인한다.

1. 소스의 설정 PATCH·company.manage·재인증·Boolean/version·no-op/감사·세션 보존과 현재 브라우저 표시 전용 상태를 대조하고 사용자 확정 대기/실제 전표 승인 후속 경계를 분리한다.
2. 선택안 6개·구현 파일 항목 10개·미실행 완료 조건 8개, 관련 문서의 로컬 링크와 UTF-8을 확인한다.
3. 이번 문서 변경 전에 기록한 코드/테스트/DB/환경/패키지/인프라·직전 실행 증거 SHA-256을 대조하고 새 구현 파일이 아직 없음을 확인한다.
4. P/F/G 상태·AUTH 10행·직전 본인 접근 완료 조건 8개를 보존하고 인덱스/계획/로드맵/담당 기능 문서의 제안 연결을 확인한다.

재현 명령: `node .artifacts/proposal-f01-company-settings-browser/verify.cjs`. 준비 검증 결과는 실행 후 별도로 기록한다. 서비스 readiness·현재 테스트 재실행·Hindsight 최신 원격 일치는 소스 기반 제안 준비에 필요하지 않아 이번에는 조회하지 않는다. 문서 동기화는 기존 30분 예약에 맡기며 성공으로 가정하지 않는다.

## 문서 준비 실행 결과 — 2026-10-06

위 명령 종료 코드 0, 준비 조건 4개 모두 PASS다. [결과 JSON](../../.artifacts/proposal-f01-company-settings-browser/results.json)과 [변경 전 해시·정책 기준](../../.artifacts/proposal-f01-company-settings-browser/baseline.json)을 보존한다. 이것은 설계 문서 검증이며 사용자 확정·설정 화면 구현 완료와 구분한다.

| 조건 | 상태 | 구체적 근거 |
| --- | --- | --- |
| 1 서버 계약·범위 | PASS | controller 전용 PATCH/company.manage/재확인·strict Boolean/version·service no-op와 browser API 미연결 소스 대조, 결과 check1 |
| 2 항목 수·링크 | PASS | 선택안6/파일 항목10/미실행 조건8·로컬 링크371개 존재·UTF-8, 결과 check2 |
| 3 코드·설정 보존 | PASS | 기존 코드/DB 정의/환경/패키지/테스트·직전 증거179개 SHA-256 동일, 새 구현 파일 없음, 결과 check3 |
| 4 정책·상위 체크 보존 | PASS | P/F/G139개·AUTH10행·직전 완료8개 동일, 관련 문서4개 제안 연결, 결과 check4 |

준비 시점 미검증(역사 기록): 당시 후속 구현 조건8개는 화면 선택값 확정과 구현 전이므로 실행하지 않았다. 서비스 readiness/전체 테스트 재실행과 최신 Hindsight 원격 일치는 당시 소스 기반 제안 준비의 검증 범위 밖이었다. 현재 화면 검증은 아래 실행 결과로 별도 확인한다.

## 설정 화면 실제 실행 증거 — 2026-10-06

최종 [검증 결과](../../.artifacts/implementation-f01-company-settings-browser/verification-results.json), [명령·종료 코드](../../.artifacts/implementation-f01-company-settings-browser/command-results.json), [소스·정책 보존](../../.artifacts/implementation-f01-company-settings-browser/contract-evidence.json), [실제 DB·브라우저](../../.artifacts/implementation-f01-company-settings-browser/live-evidence.json)를 기록했다.

첫 묶음은 완료 조건 7·8 두 개가 FAIL이고 나머지 여섯 개는 PASS였다. [첫 결과](../../.artifacts/implementation-f01-company-settings-browser/first-pass.json)와 첫 E2E/API 로그를 보존했다. 768px 날짜 입력이 작업 공간 밖으로 밀리는 실제 요소 폭(문서 992px·종료일 오른쪽 911px)을 확인해 날짜 배치를 수정했다. 캡처에서 발견한 태블릿 작업 공간의 과도한 줄바꿈도 목록/작업 공간의 세로 배치로 해결했다. API의 격리 마이그레이션/5초 시간 초과는 별도 실행과 `--maxWorkers=2`로 해소했으며 서버/테스트 기대값·timeout 설정은 변경하지 않았다. 정적 검사의 `queryKey` 오탐은 비밀 없는 `['companies']` 목록 무효화만 허용하는 검사로 정정했다. 수정 후 실패 항목만 반복하지 않고 전체 묶음을 재실행했다.

| 조건 | 상태 | 실제 근거 |
| --- | --- | --- |
| 1 확정·범위 | PASS | S1~S6·파일10/API1/조건8·2026-10-06 사용자 “확정”·영향 ID·UTF-8/로컬 링크, contract-evidence |
| 2 권한·명시적 저장 | PASS | 새 E2E 관리자/조회 전용·radio/확인 무저장·strict Boolean/version·회사 ID, tests/e2e/company-settings.spec.ts:38,58 |
| 3 양방향·version | PASS | 실제 false→true→false/version5→6→7·요약/목록; UI 동일값 차단·서버 no-op/stale/최대값/이름·기간 공유 version 회귀 |
| 4 비밀번호·만료 | PASS | 제출 즉시 입력 삭제·로컬 async/비밀 없는 Query 경계·wrong-password 세션 유지/실제 만료 로그인 E2E, 서버 정확한 5분 경계 테스트 |
| 5 잠금·접근 회수 | PASS | 선택/생성/이름/기간/설정 진행 잠금·ID 응답 가드·409 확인 폐기/권한 재선택·403/404 정리·400/429 고정 안내 |
| 6 응답 유실·감사/세션 | PASS | 503/network 미확인 상태 차단/조회 후 명시 재시도; 실제 PATCH2/감사2·현재/다른 기기 세션·CSRF/절대 만료·역할/다른 회사 보존 |
| 7 접근성·반응형 | PASS | E2E82/82 중 키보드 focus/Escape/Enter·label/fieldset/status/alert·375/768/1440px 넘침 없음·아래 캡처 직접 확인·기존 화면 회귀 |
| 8 전체 회귀·격리/현 상태 | PASS | build/lint exit0·Appearance16/16·E2E82/82·API413/413(19파일)·기본atms20테이블 건수/내용 해시 동일·UI4173/API4300 readiness200·최신 소스·비밀 없는 증거·보호176파일 |

확인 캡처: [375px](../../.artifacts/implementation-f01-company-settings-browser/company-settings-375.png), [768px](../../.artifacts/implementation-f01-company-settings-browser/company-settings-768.png), [1440px](../../.artifacts/implementation-f01-company-settings-browser/company-settings-1440.png), [실제 설정 저장](../../.artifacts/implementation-f01-company-settings-browser/company-settings-live.png). API/기본 atms/현재 브라우저는 실행 시점에 다시 확인했다. 기존 lint의 UiIcons 경고 1개와 Vite 큰 번들 경고는 남아 있으며 오류는 없다.

필수 미검증 항목은 없다. 실제 전표 승인·가입/확인/복구 웹 화면·운영 SMTP·최신 Hindsight 원격 일치는 이번 범위에서 구현/검증하지 않았으며 후속 또는 기존 30분 예약 영역이다. P/F/G139개·AUTH10행·직전 본인 접근 조건8개와 상위 전체 기능 체크는 유지한다.
