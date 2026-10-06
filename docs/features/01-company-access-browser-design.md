# F01·F08 회사 초대·접근 요청 관리자 브라우저 화면

[문서 인덱스](../README.md) · [초대·접근 요청 서버](01-company-invitations-design.md) · [구성원 관리 화면](01-company-members-browser-design.md) · [회사와 사용자 권한](01-company-access.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **관리자 초대·접근 요청 브라우저 부분 구현·검증 완료**. 확정일·완료일: 2026-10-06. 사용자 확정 근거: 추천값 7개와 구현 파일 10개·검증 조건 8개를 제시한 뒤 “확정”. 영향 ID: F01-02·F01-05·F01-06·F01-08 및 F08-09·F08-14·F08-15의 회사 접근 관리 화면 부분. 서버에서 이미 구현·검증한 11개 API 중 관리자용 7개를 기존 `/companies`에 연결했다.

## 제안 범위와 경계

1. 기존 `/companies`의 선택 회사 아래에 `초대`와 `세무사 접근 요청` 두 탭을 가진 관리자용 접근 관리 영역을 둔다. 화면 전역 회사 선택값을 만들지 않고 현재 페이지의 명시적 선택을 사용한다.
2. `company.members.manage` 권한이 있을 때만 초대·접근 요청 API를 호출한다. 비관리자에게 이메일·요청자 정보를 내려받지 않고 기존 권한 안내만 표시한다.
3. 초대 탭은 25개 cursor 목록에 이메일·역할·상태·만료 시각·version을 표시한다. 이메일과 1~5개 역할 전체 집합으로 초대를 만들고, `PENDING` 초대만 취소하거나 재발송한다. 재발송은 새 링크와 7일 만료를 만들고 이전 링크를 무효화한다.
4. 접근 요청 탭은 25개 cursor 목록에 요청자 이메일·계정 상태·요청 상태·만료 시각·version을 표시한다. `PENDING` 요청만 승인하거나 반려하며 승인은 서버 정책대로 `EXTERNAL_TAX` 역할의 새 활성 소속을 만든다.
5. 초대 생성·취소·재발송과 요청 승인·반려는 실행할 때마다 관리자 현재 비밀번호를 재확인한다. 비밀번호는 제출 직후 화면 상태에서 지우고 저장·로그·오류에 남기지 않는다. 확인 단계에는 대상 이메일과 실제 동작을 명시한다.
6. 409는 목록을 다시 읽고 오래된 확인 상태를 닫아 자동 재전송하지 않는다. 400·401·403·404·409·429·503을 구분하며 메일 발송은 DB commit 뒤 처리되므로 저장 성공과 발송 실패/재발송 안내를 혼동하지 않는다.
7. 이번 묶음은 관리자 API 7개만 연결한다. `POST /api/company-invitations/accept`, 세무사 본인의 요청 생성·목록·취소 3개 API, 중지 소속 재활성화와 본인 승인 설정 화면은 후속이다. 초대 수락은 이메일 링크 경로, 본인 접근 요청은 회사 식별 진입 경로를 다음 설계에서 함께 확정한다.

## 사용자가 확정한 값 7개

| 항목 | 추천값 | 영향 |
| --- | --- | --- |
| 화면 위치 | 기존 `/companies`의 구성원 관리 다음에 접근 관리 영역 | 선택 회사·권한·세션을 재사용하고 새 전역 회사 상태를 만들지 않는다. |
| 내부 탐색 | `초대`와 `세무사 접근 요청` 두 탭 | 긴 관리자 페이지에서 두 cursor·빈 상태·오류를 섞지 않는다. |
| 조회 권한 | `company.members.manage`가 있을 때만 두 API 호출 | 비관리자 브라우저에 초대 이메일과 요청자 정보를 전달하지 않는다. |
| 페이지 크기 | 각 탭 25개 cursor와 “더 보기” | 서버 기본값과 일치하며 두 목록의 cursor를 독립적으로 유지한다. |
| 초대 역할 입력 | 다섯 체크박스 중 1개 이상, 전체 집합 제출 | 서버 strict 역할 배열과 권한 합산 정책을 그대로 표현한다. |
| 민감 작업 | 생성·취소·재발송·승인·반려마다 현재 비밀번호 재확인 | 작업 의도를 명확히 확인하고 제출 즉시 비밀번호를 지운다. |
| 충돌 처리 | 확인 상태를 닫고 해당 목록을 최신 상태로 재조회 | 오래된 version·만료·이미 처리된 항목을 자동으로 다시 보내지 않는다. |

## 수정·생성할 구현 파일 항목 10개

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `src/lib/api.ts` | 초대·관리자 접근 요청 view, 두 cursor와 관리자 mutation 7개 타입/API 추가 |
| 수정 | `src/pages/companies/CompanyManagement.tsx` | 권한별 두 query와 재확인·409/429·목록 갱신 mutation 조합 |
| 수정 | `src/components/companies/CompanyWorkspace.tsx` | 구성원 관리 다음에 접근 관리 영역 연결 |
| 생성 | `src/components/companies/CompanyAccessPanel.tsx` | 초대/요청 탭, 생성·취소·재발송·승인·반려 확인 UI |
| 생성 | `tests/e2e/company-access-management.spec.ts` | 권한·cursor·메일 상태·처리·충돌·오류·접근성·반응형 행동 검증 |
| 생성 | `.artifacts/implementation-f01-company-access-browser/live-company-access-check.cjs` | 격리 DB·Mailpit에서 실제 초대/재발송/취소와 요청 승인·감사·소속 검증 |
| 생성 | `docs/features/01-company-access-browser-design.md` | 사용자 확정값·경계·파일·검증 근거 |
| 수정 | `docs/features/01-company-access.md` | 관리자 접근 화면 상태와 후속 본인 흐름 연결 |
| 수정 | `docs/README.md`·`docs/ROADMAP.md` | 문서 인덱스와 현재 제안/구현 상태 연결 |
| 수정 | `docs/IMPLEMENTATION_PLAN.md` | 영향 작업의 제안·확정·부분 구현 기록 |

서버 스키마·마이그레이션·초대/요청 controller/service/schema, 메일 설정과 기존 구성원 화면은 변경하지 않는다. 구현 중 서버 계약 결함이 확인되면 증거와 추가 파일을 먼저 제시하고 범위를 다시 확인한다.

## 구현 후 묶어서 검증할 조건 8개

- [x] **PASS** — 사용자 “확정”, 2026-10-06, 영향 ID·10개 파일 항목과 관리자 7개/후속 4개 API 경계를 문서에 기록했다.
- [x] **PASS** — 관리자 자기 회사 조회와 비관리자 API 미호출, 타 회사·없는 ID/cursor 차단을 새 브라우저 8개와 기존 서버 회귀로 확인했다.
- [x] **PASS** — 초대 25개 cursor·빈/만료/처리 상태, 이메일·1~5개 역할 생성, 취소·재발송·version과 이전 링크 HTTP 400을 확인했다.
- [x] **PASS** — 접근 요청 cursor·요청자 상태, 승인 시 EXTERNAL_TAX 소속과 대상 세션 401, 반려 시 소속 0건·세션 200 및 서버 경합 검사를 확인했다.
- [x] **PASS** — 다섯 mutation의 현재 비밀번호 재확인·즉시 삭제, 409 최신 재조회와 400·401·403·404·429·503 오류·재시도를 브라우저/서버 회귀로 확인했다.
- [x] **PASS** — 실제 Mailpit 신규/재발송 2건, 새 토큰 해시 일치·이전 링크 무효화와 생성/재발송/취소·요청 생성/승인/반려 감사를 확인했다.
- [x] **PASS** — 탭/label/fieldset/status/alert·키보드 포커스와 375·768·1440px 가로 넘침 없는 화면·스크린샷을 확인했다.
- [x] **PASS** — build·lint, Appearance 16개·브라우저 34개·API 413개, 격리 DB 실제 쓰기와 기본 `/atms` 0건·민감정보 비저장을 확인했다.

## 실제 실행 검증 기록

새 화면은 `src/lib/api.ts`의 두 cursor·다섯 mutation, `CompanyManagement.tsx`의 권한별 query/mutation과 `CompanyAccessPanel.tsx`의 두 탭으로 연결했다. 기존 구성원 테스트의 역할 checkbox locator는 새 초대 역할 이름과 겹치므로 구성원 fieldset으로 범위를 한정했다. 승인 범위 밖의 초대 수락·세무사 본인 요청 3개·재활성화·본인 승인 설정 화면은 추가하지 않았다.

최초 종합 실행은 서버 413개 중 1개가 병렬 CPU 부하에서 5초 제한을 1.1초 초과했고 나머지 412개가 통과했다. 실행 경합을 제거해 전체 묶음을 순차 재실행했고 build·lint exit 0, Appearance 16/16, 브라우저 34/34, 서버 19개 파일·413/413이 통과했다. 4173/4300 장기 실행 프로세스의 오래된 모듈을 현재 소스로 갱신한 뒤 최종 실브라우저 검증을 수행했다. lint의 기존 `UiIcons.tsx` 미사용 억제 주석 경고와 Vite 500kB 번들 경고는 종료 코드 0의 비차단 경고다.

실제 격리 DB와 Mailpit에서는 초대 메일 2건, 재발송 토큰 교체·새 해시 일치·이전 토큰 HTTP 400, 취소 상태/version 3을 확인했다. 요청 승인은 `EXTERNAL_TAX` 소속과 기존 세션 HTTP 401을 만들고, 반려는 소속 0건과 기존 세션 HTTP 200을 유지했다. 생성 2건·승인·반려와 초대 생성·재발송·취소 감사가 각 예상 횟수로 남고 감사의 이메일/비밀번호/토큰 필드는 0건이다. [최종 결과](../../.artifacts/implementation-f01-company-access-browser/results.json), [실DB 증거](../../.artifacts/implementation-f01-company-access-browser/live-company-access-evidence.json), [실DB 화면](../../.artifacts/implementation-f01-company-access-browser/company-access-live-database.png), 375·768·1440px 화면을 보존했다. 기본 `/atms`의 사용자·회사·소속·초대·요청·감사는 모두 0건이다.
