# 전표 초안·증빙 연결 화면과 홈서버 반영 설계안

[문서 인덱스](../README.md) · [구현 계획](../IMPLEMENTATION_PLAN.md) · [전표와 원장](04-journals-ledger.md) · [완료한 서버 계약](04-journal-draft-foundation-design.md)

작성일/확정일: 2026-10-07. 상태: **B1~B8 화면·기존 홈서버 반영·실제 자료 검증 K1~K8 PASS(해당 부분 완료)**. 직전 구체적인 화면/파일/검증/홈서버 반영 제시 뒤 사용자 “확정”(04-journal-draft-browser-design.md 지정)으로 B1~B8 전체를 선택했다. 영향 작업은 F04-03~07·10/F03-04/F08-09·14·15/F12의 화면·기존 홈서버 반영 부분이다. 실제 선택값은 아래 B1~B8이며 구현/검증 완료와 구분한다.

작업 ID: F04-03~07·10 초안 화면 부분, F03-04 증빙→초안 연결 부분, F08-09·14·15 조회/입력 기반, F12 기존 홈서버 반영 부분. P-01·02·03·04·10과 서버 J1~J8의 확정값을 재사용한다. 승인 요청·승인/반려·확정·삭제/취소·장부/원장·마감/정정·기초 잔액·표준 계정/매핑·보고서/세금 계산은 후속이다. 초안은 장부/보고서에 반영된 거래로 표시하지 않는다.

## 현재 근거와 진행 순서

- [서버 최종 결과](../../.artifacts/implementation-f04-journal-draft/results.json)는 K1~K8 PASS, 서버761/761·DOM80/80·Appearance16/16와 build/타입/schema/lint 종료0이다. 완료한5경로와 J1~J8을 브라우저가 그대로 호출한다. 업무 서버/추가 SQL을 화면 편의 때문에 수정하지 않는다.
- 확정 전 기준: [App](../../src/App.tsx), [Sidebar](../../src/components/layout/Sidebar.tsx), [api.ts](../../src/lib/api.ts)에 초안 경로/메뉴/클라이언트 연결이 없었다. 현재 구현/배포 상태는 아래 실행 기록을 따른다. [계정 화면](04-accounts-browser-design.md)과 [증빙 상세](../../src/components/evidence/EvidenceDetail.tsx)는 존재하며 회사별 조회/권한/원본 미리보기를 재사용할 수 있다.
- 현재 [홈서버 조회](../../.artifacts/proposal-f04-journal-browser/home-current.json)는23테이블·12migration·기존 가상 계정2개다. 전표4테이블은 아직 없다. [URL 현재 검사](../../.artifacts/proposal-f04-journal-browser/urls.json)는 공개 UI/준비 상태200과 미배포 초안 API404를 확인한다. 로컬 기본 DB의 [현재 조회](../../.artifacts/proposal-f04-journal-browser/local-db-current.json)는23테이블·11완료 migration·전표 테이블0으로 홈서버와 구분한다. 로컬 값은 직전 서버 검증의 기본 DB 지문 개수와도 대조한다. 과거 실행 기록을 현재 배포 상태로 대신하지 않는다.
- [역할표](../../server/src/auth/access-policy.ts)는5역할 모두 journal.read/accounts.read/counterparties.read/evidence.read, 관리자·회계 담당자·외부 세무사에 journal.draft를 허용한다. 이 화면 때문에 권한을 추가하지 않는다. 증빙 역조회는 journal.read와 evidence.read를 함께 확인한다.
- React18, TanStack Query, React Hook Form, Zod, Lucide, Testing Library, Playwright는 [현재 패키지](../../package.json)에 이미 있다. 새 의존성이나 React19 전용 동작은 제안하지 않는다. 전체 디자인 시스템 검색은 기존 회계 입력 화면에 맞지 않아 적용하지 않고 기존 HUD/Pretendard/[Appearance](08-platform.md#settings--appearance-구현-계약)를 유지한다. UX 검색에서 확인한 오류 요약 포커스/필드 오류 연결/가려지지 않는 포커스 지침만 반영한다.

순서: B1~B8·17파일·K1~K8/홈서버 반영 확정 → 사용자 선택값/근거/날짜/영향ID 기록 → api.ts부터 파일별 설명과 구현 → 로컬 전체 검증 → 홈서버 적용 이력/자료/백업 확인 → 검증된 기존 전표 SQL1개와 API/화면 반영 → 배포 HTTPS의 시험·현재 사용자 실제 브라우저 검증 →8조건 전체 집계 → 부분 완료 기록. 새 개발 서비스/포트는 시작하지 않는다.

## 확정한 화면 선택값 8개

아래는 2026-10-07 사용자 “확정”으로 선택한 값이다. 서버 J1~J8의 범위/번호/금액/참조/권한/원자성 계약은 그대로 유지한다.

| ID | 추천 선택값 | 동작과 영향 |
| --- | --- | --- |
| B1 | 보호 경로 `/accounting/journals`, 회계·세무 메뉴 “전표 초안”. 명시적인 회사 선택과 회사 선택 응답 permissions로 조회/작성 분리 | 단독 승인자/조회 전용은 목록·상세만 제공한다. 회사 선택은 페이지 메모리와 현재 권한 재확인으로 처리하며 첫 회사/연도를 자동 선택하지 않는다. 증빙의 “초안 열기” 링크는 companyId/journalId만 전달하고 대상 회사의 현재 권한을 다시 확인한다. 잘못된 UUID/회사/없는 상세를 안전하게 거부한다. 역할·금액·적요·요청 ID를 URL에 넣지 않는다. |
| B2 | 목록20건, 번호/적요 검색·회계연도·회계일자 from/to 필터와 이전/다음 cursor. 요약→상세→수정 | 모든 금액을 원 단위 문자열로 표시한다. 초안 표시·번호·회계일자·적요·차대 합계·행/증빙 수·version·처리 시각, 상세에 계정/행 메모·명시 거래처·증빙을 표시한다. 날짜/시각을 구분하고 상세의 번호/연도/작성자는 읽기 전용이다. 총 건수·임의 정렬은 제공하지 않는다. 회사·사용자·필터·cursor별 query key, 늦은 응답 폐기와 취소를 적용한다. |
| B3 | 등록은 회사 회계연도와 기간 안의 날짜·적요·2~100분개·선택 거래처1·증빙0~20을 직접 입력 | 회계연도/날짜/계정은 빈 선택, 두 분개 행의 차대는 각각0으로 시작하며 사용자가 양수 한쪽을 입력한다. 행 추가/삭제로 최소2·최대100을 지키고 순서를 유지한다. 사용중/분류 완료 계정과 사용중 거래처만 새 선택에 허용한다. 명시적인 “없음”과 빈 증빙 배열을 보낸다. 참조는 검색/더 보기로 페이지 조회하고 현재 선택 ID는 별도 보존한다. 첫100개 밖의 회계기간도 기존 API cursor로 조회하며 fiscalYears 클라이언트에 선택적인 cursor 인자를 추가한다. 기존 호출의 두 인자는 유지한다. |
| B4 | `type=text`/숫자 입력 힌트·문자열 원문과 BigInt로 원 단위 합계/차액 계산. React Hook Form의 행 배열과 기존 Zod 활용 | 서버 원 단위 입력과 동일한 문법/18자리 범위, `-0`의0정규화, 음수/소수/지수/쉼표/선행0 거부, 한쪽 양수/다른 쪽0, 정확한 양수 균형과 합계 범위 확인. 적요/행 메모 trim·코드 포인트500자·잘못된 문자열/빈 값 검사. 불균형/오류를 필드·행과 포커스 오류 요약으로 연결한다. Number/parseFloat로 금액을 합산하거나 자동 반올림·자동 차액 보정하지 않는다. BigInt는 계산에만 사용하고 JSON에는 정규화10진수 문자열만 넣는다. |
| B5 | 등록은 유효한 첫 제출 때 UUID+정규화 전체 본문을 메모리에 고정, 즉시 이중 클릭 차단. 수정은 조회한 version과 전체 내용을 PATCH | POST 응답 유실/연결 오류/5xx에서는 입력을 잠그고 동일 ID/본문으로 명시적 재시도 또는 저장 목록 확인 뒤 폐기를 제공한다. 같은 내용은 같은 요청으로 확인하고 새 값을 같은 ID로 보내지 않는다. PATCH는 등록과 달리 version/전체 내용 계약이다. 409/응답 유실 시 기존 입력을 보관·잠금하고 최신 저장 상태 확인과 “기존 입력을 폐기하고 다시 수정” 확인을 제공한다. 자동 덮어쓰기/재전송 없음. 성공 후 서버의 현재 상세 반영·목록/증빙 연결 캐시 갱신. no-op은 version/감사 증가를 추정하지 않는다. |
| B6 | 회사 없음/권한 없음/자료 없음/검색0건/로딩/오류를 구분하고 조회만 명시적으로 재시도. 401/403/404/409/429/503와 연결 오류 처리 | 401은 기존 expire로 캐시/초안 제거, 403은 쓰기 중지와 현재 회사 권한 재확인, 접근 상실 시 관련 회사 자료 제거. 409를 버전 충돌 하나로 단정하지 않는다. 제출 중 회사/필터/행/상세/취소를 잠근다. 미저장/미확인 입력을 버리는 화면 내 조작은 인라인 확인. 전체 페이지 이탈/새로고침 후에는 입력/요청을 복구하지 못한다고 안내한다. local/sessionStorage·로그에 업무 본문/요청 ID를 보관하지 않는다. |
| B7 | 전표 상세의 증빙은 기존 상세/원본 미리보기 경로로 확인. 증빙 상세에는 연결된 초안 목록과 “초안 열기” 제공 | 연결/해제는 전표 전체 수정 안에서 수행한다. 증빙 상세에서 독립 연결 쓰기/승인 API를 만들지 않는다. 같은 증빙의 여러 초안을 표시하고 cursor로 더 조회한다. 기존 파일 다운로드/미리보기/업로드를 유지한다. 기존 전표의 중지 계정/거래처를 숨기지 않고 조회된 이름·상태를 표시하며 현재 조회할 수 없는 참조는 ID와 확인 불가 안내를 유지한다. 원본 키/해시/파일을 변경하지 않고 일자·거래처를 자동 복사하지 않는다. |
| B8 | 기존 HUD/Appearance·1440 목록/상세·375/768 카드/단일 열, 키보드/label/44px 조작·오류 포커스. 검증 후 기존 홈서버 API/SQL/화면 반영과 실제 가상 자료 시험 | 현재12migration checksum/업무 행 확인·DB dump/이전 API 이미지/정적 파일 백업 후 검증한 `20261007010000_journal_draft_foundation`1개만 추가 적용한다. 예상13migration/27전체 테이블(기존23+4). API 준비 상태 통과 후 정적 파일을 교체하며 기존 HTTPS·19080/내부4300·R2/SMTP/터널 설정을 유지한다. 로컬 기본 DB에는 적용하지 않는다. 기존 관리자 테스트 회사에 구분 가능한 가상 계정2·거래처1·작은 PDF 증빙1·초안2를 만들어 등록/수정/연결/해제/재조회한다. 기존 계정2개/업무 행은 보존하고 새 검증 자료도 보존한다. 실패 복구는 이전 앱/정적 파일 재적용을 우선하며 새 자료를 지우는 DB 복원을 자동 실행하지 않는다. |

## 연결할 기존 API5개

아래는 [완료한 서버 계약](04-journal-draft-foundation-design.md#http-계약-제안)의 클라이언트 연결이다. 회계기간/계정/거래처/증빙 조회는 기존 보조 API를 재사용한다.

| ID | 요청 | 화면 연결 |
| --- | --- | --- |
| API-1 | GET `/api/companies/:companyId/journals` | q/fiscalYearId/from/to/cursor/limit과 회사별 초안 목록. |
| API-2 | GET `/api/companies/:companyId/journals/:journalId` | 서버 현재 상세·분개·증빙과 읽기 전용 식별값. |
| API-3 | POST `/api/companies/:companyId/journals` | creationRequestId/fiscalYearId와 명시적인 전체 내용, HTTP200 상세. |
| API-4 | PATCH `/api/companies/:companyId/journals/:journalId` | version과 전체 수정 내용, fiscalYearId/번호/작성자/상태를 넣지 않는다. |
| API-5 | GET `/api/companies/:companyId/evidence/:evidenceId/journals` | 증빙 상세의 연결된 초안 cursor 목록. |

`journalApi`의 타입/메서드만 추가하고 기존 requestJson의 쿠키/CSRF/안전한 오류 흐름을 유지한다. 클라이언트 행 관리용 키는 서버 본문에 보내지 않는다. 참조 picker는 계정/거래처/증빙 조회 permission과 같은 회사만 사용한다. 권한/상태가 조회 뒤 바뀌면 서버 거부를 받아 현재 상태를 다시 확인한다.

## 구현 파일17개와 설명 순서

다음은 확정한 구현17파일이다. 화면/API 연결과 실제 로그인 시험을 완료했고 처음 실패와 최종 검증을 아래 실행 기록으로 구분한다. 담당 문서도 같은 상태로 갱신한다.

| 순서 | 파일 | 목적 |
| --- | --- | --- |
| 1 | `src/lib/api.ts` | 첫 구현 파일. 전표 타입/API5개와 회계기간 조회의 선택 cursor 인자. |
| 2 | `src/lib/journalDraftForm.ts` | 입력 검증·정규화·BigInt 합계/차액·서버 본문 생성. |
| 3 | `src/pages/accounting/Journals.tsx` | 회사/권한·목록/상세·등록/수정·실패/미확인 상태와 캐시 제어. |
| 4 | `src/components/journals/JournalList.tsx` | 검색/기간/연도 필터·cursor·반응형 목록. |
| 5 | `src/components/journals/JournalDetail.tsx` | 초안 상세·불변값·분개·증빙 참조·수정 진입. |
| 6 | `src/components/journals/JournalDraftForm.tsx` | 명시 입력·행 배열·균형/오류·포커스·제출 잠금. |
| 7 | `src/components/journals/JournalReferencePicker.tsx` | 같은 회사의 계정/거래처/증빙 검색/페이지/현재 선택 보존. |
| 8 | `src/components/journals/EvidenceJournalLinks.tsx` | 증빙의 연결 초안 목록과 권한 확인을 거치는 상세 링크. |
| 9 | `src/pages/accounting/Evidence.tsx` | 선택 회사/현재 journal.read를 증빙 상세에 전달. |
| 10 | `src/components/evidence/EvidenceDetail.tsx` | 원본/미리보기를 유지하고 연결 초안 영역을 추가. |
| 11 | `src/App.tsx` | 기존 세션 보호 아래 초안 경로. |
| 12 | `src/components/layout/Sidebar.tsx` | 회계·세무의 전표 초안 메뉴. |
| 13 | `tests/journals.test.tsx` | 입력/큰 합계/행/권한/재요청/캐시/실패의 DOM·순수 함수 시험. |
| 14 | `tests/e2e/journals.spec.ts` | 배포 URL의 가상 역할·상태·반응형/키보드 시험, 업무 쓰기는 mock으로 분리. |
| 15 | `tests/e2e/journals.deployed.config.ts` | 기존 HTTPS만 사용, webServer 없이 실행. |
| 16 | `.artifacts/implementation-f04-journal-browser/rollout.sh` | 소유 서버 확인·백업·1개 추가 SQL/API/정적 파일·기존 포트 유지. |
| 17 | `.artifacts/implementation-f04-journal-browser/verify-completion.mjs` | 전체 검증 묶음·과거 증거/자료 보존·배포/실제 브라우저 결과 집계. |

각 파일에 실행 흐름/입출력/실패/변경 목적과 라이브러리 역할을 주석으로 설명하고 코드 줄 번호로 보고한다. React Hook Form은 많은 분개 행의 입력/오류/추가·삭제를, TanStack Query는 회사별 읽기 캐시를 관리한다. 이 두 역할을 업무 저장 성공/권한 판정과 혼동하지 않는다. 17파일 변경 후 관련 시험·타입·빌드를 한 묶음으로 실행한다.

## 승인 후 완료 검증 조건8개

아래는 확정한 검증 조건이다. 로컬 첫 검증 및 전체 재검증을 진행하며, 홈서버 반영/실제 브라우저 검증은 로컬 통과 후 실행한다. 최종 K1~K8 완료와 제안 문서의 D1~D3를 구분한다.

| ID | 완료 조건 | 실행 증거 |
| --- | --- | --- |
| K1 | 보호 진입/명시 회사·5역할 조회와3역할 작성·증빙 역조회 권한·다른 회사/늦은 응답 격리 | 실제 컴포넌트/가상 배포 시험의 권한·401/403·cache key·회사 전환 결과. |
| K2 | 목록/검색/기간·연도·cursor/상세·지원 범위와 날짜/번호/작성자 불변 표시 | 실제 요청 query/body 대조·기간 경계·빈 자료/검색0건·연결 상세/직접 URL 시험. |
| K3 | 원 단위 정확 계산/입력·2~100행·참조 선택·500자/20증빙 경계 | 큰 합계·overflow·불균형·잘못된 형식·행 순서/선택 유지·명시적 null/배열·소수/숫자형 요청0. |
| K4 | 등록 UUID/본문 고정·이중 제출/미확인/동일 재시도·최신 version/전체 수정/no-op·충돌 | POST/PATCH 실제 본문·버튼 잠금·응답 유실과409·자동 덮어쓰기/재전송0·성공 캐시 갱신. |
| K5 | 증빙 연결/해제·여러 초안 역조회·원본 접근·중지/참조 오류와 실패 안내 | 기존 증빙 다운로드/미리보기 회귀·연결 목록/커서/상세 링크·현재 자격 오류·원본/키 불변. |
| K6 | 375/768/1440·Appearance·키보드/label/오류 요약/필드/상태·이탈 안내 | 화면 screenshot·수평 넘침 검사·44px/포커스/키보드 시험·light/dark/글자 설정. |
| K7 | 전체 회귀/타입/schema/build/lint와 기존 코드·정책·체크/과거 증거 보존 | 기존 서버761·DOM80·Appearance16 포함 전체 시험, 명령 exit0·보호 파일/정책5/139행/hash·문서 링크. |
| K8 | 기존 홈서버만 추가 반영·백업/행 보존·실제 가상 등록/수정/증빙 경로/새로고침 | 기존12checksum 동일·새 SQL1개/13migration/27테이블·HTTPS200/초안 미인증401·DBdump manifest·가상2초안/4분개/최종1연결·초안 감사4건·기존 계정2개/업무 행 보존·현재 사용자 브라우저 screenshot와실DB 대조. |

실제 시험은 가상 계정2·거래처1·PDF 증빙1을 만들고, 두 초안에 동일 증빙을 연결한다. 첫 초안의 적요 수정(version1→2), 증빙 연결 해제(version2→3), 두 번째 초안의 남은 연결을 증빙 상세에서 확인한다. 전체 차대 합계는 일치해야 한다. 가상 초안2개/분개4개/최종 연결1개·초안 감사4건과 ID/번호/작성자 유지·원본 해시/메타데이터 불변을 비교한다. 서버 강제 실패/경합 시험은 격리 DB에서 유지하고 실제 홈서버에 장애를 주입하지 않는다. 현재 로그인된 사용자 화면에서 수행하며 세션 만료 시 사용자 로그인 뒤 실제 검증을 재개한다.

첫 검증의 FAIL+UNVERIFIED가2개 초과면 가장 앞선 실패 계층에서 수리 중단,2개 이하면 근본 원인 수리 후8조건 전체 재실행. 필수 비통과가 남으면 화면/배포를 완료로 표시하지 않는다. 이 화면만으로 F03/F04/전체 출시139행을 완료 처리하지 않는다. Hindsight는 기존30분 예약을 유지하며 수동 동기화하지 않는다.

## 이번 제안 문서의 검증3조건

문서 작성 전에 [baseline](../../.artifacts/proposal-f04-journal-browser/baseline.json)에 보호309파일·정책5개·139체크와 미래 구현17파일을 기록했다. D1=선행 정책/서버 계약·완료 시험·현재 홈서버/로컬 기본 DB/공개 URL 대조, D2=기존 코드/설정/SQL/정책/139행/과거 결과 보존과 신규 업무 파일 미생성, D3=관련6문서 UTF-8/링크·B8/API5/17파일/K8 목록의 정확한 일치다. [제안 검증기](../../.artifacts/proposal-f04-journal-browser/verify.py)와 [결과](../../.artifacts/proposal-f04-journal-browser/results.json)를 따른다. 이3조건 PASS는 사용자 확정이나 새 화면/SQL 적용/배포 검증 PASS를 뜻하지 않는다.

실행 결과(2026-10-07): `python .artifacts/proposal-f04-journal-browser/verify.py` 종료0, D1~D3 모두PASS. D1은 서버761개/8조건 완료 근거·홈서버23테이블/12migration·로컬23테이블/11완료migration·공개 UI/준비200·초안 API404를 대조했다. D2는309파일/정책5/139행과 신규 업무 파일 미생성을, D3는6문서 링크·8선택/5API/17파일/8완료 조건 일치를 확인했다. 첫 D1 실패는 검증기가 로컬 이력 개수를 홈서버와 같은12로 가정한 기대값 오류다. [최초 결과](../../.artifacts/proposal-f04-journal-browser/first-results.json)를 보존하고 실제 로컬 값11과 직전 기본 DB 지문의 개수를 대조하도록 수정한 뒤3조건 전체를 재실행했다. DB 이력을 변경해 기대값에 맞추지 않았다. 화면/홈서버 구현 검증 K1~K8은 범위 확정 대기 때문에 미실행이다.

## 첫 로컬 검증과 수리 — 2026-10-07

[첫 로컬 결과](../../.artifacts/implementation-f04-journal-browser/first-local-results.json)는 K1/3/4/5/6 PASS, K2/7 FAIL이다. 서버761개는 통과했고 DOM145/153, 프런트 build/시험 타입 검사는 실패했다. 보호306파일·정책5개·139체크·과거 산출물14개 복원과 로컬 기본 DB 지문 보존은 통과했다. 실패 조건은2개라 작업 단위 완료 기준에 따라 원인을 수정하고 전체 묶음을 다시 실행한다. 첫 명령/시험 로그는 [first-run](../../.artifacts/implementation-f04-journal-browser/first-run/commands.json)에 보존했다.

가장 앞선 원인은 증빙 페이지에 Router 의존성을 직접 넣은 경계 변경이다. 기존 독립 렌더링의 원본 수명 시험7건을 보존하기 위해 URL 처리만 Router 안의 작은 자식으로 분리했다. 증빙 회사 선택 취소의 반환값도 boolean 계약에 맞췄다. 추가된 PDF 미리보기 import가 포함된 시험 타입 검사에는 기존 Vite ambient 선언 파일을 명시했다. 새 목록 시험1건은 조회 갱신으로 비활성화된 버튼을 너무 일찍 누른 준비 오류이므로 갱신 후 버튼이 활성화되는 시점을 기다린다. 업무 API/SQL/기존 시험/설정을 바꾸지 않는다. 재검증·홈서버·실제 브라우저 결과가 모두 갖춰지기 전에는 완료로 기록하지 않는다.

## 구현 코드의 실행 흐름

1. [api.ts](../../src/lib/api.ts) 384~411행은 서버 공개 view/JSON 입력 타입과5경로를 연결한다. 금액은 문자열이며 기존 requestJson이 same-origin 쿠키·CSRF·안전한 오류 응답을 처리한다. 회계기간 조회의 세 번째 cursor는 선택 인자라 기존 두 인자 호출도 유지된다.
2. [journalDraftForm.ts](../../src/lib/journalDraftForm.ts) 9/11/36행에서 식별 형식·원 단위 금액·전체 입력을 검증한다. Zod는 잘못된 필드/형식을 거부하는 검사 도구다. BigInt는 큰 원 단위 정수를 정확히 더하는 계산 타입이며 JSON에는 변환한 문자열만 보낸다. 회계기간·2~100행·각 행 한쪽 양수·양수 균형·18자리 합계·메모500자·증빙20개를 확인한다. null 거래처와 빈 증빙 배열을 생략하지 않고 내부 행 키/번호/작성자는 제외한다.
3. [JournalDraftForm.tsx](../../src/components/journals/JournalDraftForm.tsx) 9/28/32행은 React Hook Form의 비제어 입력과 행 배열로 입력을 관리한다. useFieldArray의 id는 화면 재배치 키이며 서버 ID가 아니다. 합계 영역만 useWatch로 금액 변경을 구독한다. 오류 요약으로 초점을 옮기고 각 링크가 해당 필드로 이동한다. 수정 회계연도는 읽기 전용이며 최초 등록 기본 날짜/연도/계정은 빈 값이다.
4. [Journals.tsx](../../src/pages/accounting/Journals.tsx) 44/66/90/102/115행이 회사 선택→현재 권한→조회→유효한 제출→저장 응답 흐름이다. 회사 전환 세대 번호와 Query의 사용자/회사/필터/커서 키가 늦은 응답과 다른 회사 캐시를 분리한다. 등록은 첫 유효 제출에 UUID와 본문을 고정하고 응답 불확실 시 잠근 뒤 같은 요청만 수동 재확인한다. 수정은 조회 version과 전체 내용만 보내며 충돌/응답 불확실 시 이전 입력을 보관한다. 최신 상태를 수동 조회한 뒤 명시적 폐기 확인을 해야 새 수정을 시작한다. 401은 expire,403은 현재 회사 권한 재확인이며 승인/확정/장부 처리는 없다.
5. [Evidence.tsx](../../src/pages/accounting/Evidence.tsx) 17/116/149행과 [EvidenceJournalLinks.tsx](../../src/components/journals/EvidenceJournalLinks.tsx) 9행은 회사 권한을 재확인한 링크 진입과 증빙의 연결 초안 조회다. 두 경로 모두 회사/상세 ID만 전달하며 증빙 원본은 기존 미리보기·다운로드 수명을 그대로 사용한다. 증빙 연결 쓰기/해제는 독립 API가 아니라 전표의 version 포함 전체 수정이다.

화면 스크린샷 검토에서 Zod의 기본 “Invalid UUID” 메시지가 노출되어 항목 선택 안내로 바꿨다. [변경 전 증거](../../.artifacts/implementation-f04-journal-browser/pre-visual-review/fixture-375-light.png)를 보존하고 한국어 오류 안내 조건을 DOM/브라우저 시험에 추가했으며 전체 묶음을 다시 검증한다.

## 이전 검증 상태와 로그인 대기 — 2026-10-07

[현재 집계](../../.artifacts/implementation-f04-journal-browser/results.json)는 K1~K7 PASS, K8 UNVERIFIED이며 complete=false다. 전체 재검증은 서버761/761·DOM154/154(종전80+신규74)·Appearance16/16, build/타입/schema/lint 종료0이다. [commands](../../.artifacts/implementation-f04-journal-browser/commands.json)와 [DOM](../../.artifacts/implementation-f04-journal-browser/dom-tests.json), [서버](../../.artifacts/implementation-f04-journal-browser/server-tests.json)에 실제 결과를 보존했다. 배포 HTTPS의 [브라우저12시험](../../.artifacts/implementation-f04-journal-browser/e2e.json)은5역할·미인증 보호·375/768/1440 light/dark·44px·키보드/필드/오류 포커스·수평 넘침·기술 오류 문구 비노출을 통과했다. [375 light 화면](../../.artifacts/implementation-f04-journal-browser/fixture-375-light.png) 등6스크린샷을 보존한다. 기존 Appearance16시험과 동일한 HUD 스타일/Provider를 사용하며 새 UI가 글자 설정을 별도 저장하지 않는다.

[배포 확인](../../.artifacts/implementation-f04-journal-browser/deployment-evidence.json)은 기존 `/accounting/journals`/준비 상태200, 초안 API 미인증401, 배포 index와 로컬 검증 index SHA-256의 정확한 일치, 이전 앱 image·DBdump/manifest·서버/정적 archive 백업을 확인했다. 백업 위치는 `/mnt/external-ssd/backups/johae-server/atms/pre-journal-browser-20261007`이다. 최초 PowerShell SSH stderr 리다이렉션 실행은 도구 종료1로 보고됐으므로 성공 종료로 가정하지 않았다. 실제 로그의 적용 SQL/건강 상태/정적 교체와 별도 현재 확인 명령 종료0을 대조했다. 최신 오류 안내 수정은 정적 파일만 다시 반영했고 같은 index 비교 명령도 종료0이다.

[홈서버 전](../../.artifacts/implementation-f04-journal-browser/home-before.json)/[후](../../.artifacts/implementation-f04-journal-browser/home-after.json)를 대조해 기존12migration checksum·계정2개·모든 기존 업무 행을 보존하고 승인 전표 SQL1개만 추가한13migration/27테이블을 확인했다. 로컬 기본 DB는 적용하지 않았고 회귀 시험의 baseUnchanged/onlyCreatedDatabaseRemoved가 true다. 보호306파일·정책5개·139체크·문서 링크와 과거 고정 산출물14개 복원도 통과했다.

**미검증 K8 부분:** 기존 Chrome 탭696811480을 새로고침해 실제 세션 만료와 `https://atms.approid.team/login`을 확인했다. 사용자에게 재로그인과 “로그인 완료”를 요청하고 탭을 유지했다. [현재 브라우저 근거](../../.artifacts/implementation-f04-journal-browser/browser-evidence.json)와 [자료 검증 대기](../../.artifacts/implementation-f04-journal-browser/live-db-evidence.json)는 UNVERIFIED이며 가상 자료 쓰기는 아직 수행하지 않았다. 새 전표/분개/증빙 연결은 현재0/0/0이다. 실제 UI의 계정2·거래처1·PDF1·초안2 생성, version1→2→3/최종2초안·4분개·1연결·감사4건·ID/번호/작성자/증빙 원본 보존·새로고침 대조를 재로그인 후 계속한다. 전체 F04/F03/배포 완료 체크는 올리지 않고 P/F/G139행을 유지한다. 예약 Hindsight 동기화는 기존30분 주기를 유지하며 문서 변경으로 수동 실행하지 않았다.


## 실제 브라우저 검증과 B1 메뉴 수리 완료 — 2026-10-07

사용자 “로그인완료”(api.ts 지정) 후 승인된 K8 실제 자료 검증을 재개했다. 기존 B1~B8/J1~J8·P5개 선택값을 재사용하며 새 업무 정책을 선택하지 않았다. [화면 흐름](../../.artifacts/implementation-f04-journal-browser/live-ui-flow.json)과 [최종 화면](../../.artifacts/implementation-f04-journal-browser/live-final.png)은 사용자 Chrome 탭696811613에서 실제 UI로 수행한 결과다. 가상 계정 `K8261007A/B`, 거래처 `K8-261007-가상거래처`, PDF `K8-261007-PDF`와 초안 `20260101-000001/000002`를 등록했다. 첫 초안의 적요 변경(version1→2)과 연결 해제(version2→3) 후 두 번째 초안만 증빙 역조회에 남았으며 새로고침/메뉴 재진입으로 저장 상태를 확인했다. 시험 자료는 재현용으로 보존했다.

[실제 DB 대조](../../.artifacts/implementation-f04-journal-browser/live-db-evidence.json)는 초안2·분개4·최종연결1·증빙1·계정2·거래처1·초안감사4를 확인했다. [등록 직후](../../.artifacts/implementation-f04-journal-browser/live-linked.json), [적요 수정 뒤](../../.artifacts/implementation-f04-journal-browser/live-memo.json), [최종](../../.artifacts/implementation-f04-journal-browser/live-after.json)의 ID/번호/작성자/일자/거래처/합계/분개를 비교했다. PDF 원본 메타데이터·저장키를 포함한 행 지문이 같고 로컬619바이트 PDF·DB sha256·실제 다운로드 파일의 SHA-256은 `439543e7297891663d89bafb1ad811dd9494bcce21d014cbe1c406e68fabbfa5`로 일치한다. 브라우저 도구의 download 이벤트는 시간 초과였지만 실제 Downloads 파일 생성/크기/해시와 사용자 첨부 PDF 화면을 확인했다. 이벤트 수신만으로 다운로드 실패를 단정하지 않았다.

첫 실제 검증 집계는 [K1 FAIL·K2~K8 PASS](../../.artifacts/implementation-f04-journal-browser/live-first-results.json)다. 직접 URL 진입은 동작했지만 승인 B1의 Sidebar 메뉴 등록이 빠졌고 종전 시험도 직접 URL만 사용해 누락을 잡지 못했다. 비통과1개이므로 `src/components/layout/Sidebar.tsx`에 승인 링크와 변경 목적 주석을 추가하고 `tests/e2e/journals.spec.ts`의5역할 시험을 실제 메뉴 진입/href/현재 페이지 표시 검증으로 바꿨다. 완료 집계에도 실제 로그인 화면의 메뉴 존재를 K1에 포함했다. 이 수정은 새 범위가 아니라 기존 B1 누락 수리이며 api.ts·DB/서버 업무 코드는 변경하지 않았다.

전체 재검증 중 기존 `atms-dev-mailpit-1`이 Exited(255)여서 의존성 준비 단계에서 중단됐다. 이미 설치된 컨테이너를 `docker start atms-dev-mailpit-1`로 재기동한 뒤 기존 묶음을 다시 실행했다. 신규 서비스/포트/설정은 만들지 않았다. 서버761/761·DOM154/154·Appearance16/16, build/타입/schema/lint 종료0과 과거14산출물 복원·보호306파일·정책5개·139체크를 확인했다. 배포 브라우저12/12도 PASS이며 실제 메뉴 진입5역할·375/768/1440 light/dark·키보드/오류 포커스/44px/수평 넘침·미인증 보호를 포함한다. Playwright JSON은 설정 파일 기준으로 생성된 `tests/e2e/.artifacts/implementation-f04-journal-browser/e2e.json`을 집계 경로로 복사해 이번 실행 시각/12개 결과를 대조했다.

[정적 반영](../../.artifacts/implementation-f04-journal-browser/rollout-menu.sh)과 [실행 로그](../../.artifacts/implementation-f04-journal-browser/rollout-menu.log)는 종료0이다. 메뉴 수정 전 정적 archive를 기존 백업 경로의 `web-before-menu.tar`로 추가 보관하고 새 asset을 추가한 뒤 index를 rename했다. 이전 asset/앱 image/DBdump·manifest를 유지했고 SQL 추가 적용·DB 자료 변경·API 재시작은 없었다. [현재 배포 검증](../../.artifacts/implementation-f04-journal-browser/deployment-evidence.json)은 HTTPS200/미인증401·배포/로컬 index SHA-256 일치, [홈서버 최종 지문](../../.artifacts/implementation-f04-journal-browser/home-after.json)은13migration/27테이블·기존12checksum·기존 계정2개/업무 행 보존을 확인한다.

최종 `python .artifacts/implementation-f04-journal-browser/verify-live.py report`와 `node .artifacts/implementation-f04-journal-browser/verify-completion.mjs`는 종료0, [K1~K8 전체 PASS](../../.artifacts/implementation-f04-journal-browser/results.json)다. B1~B8의 초안 화면/기존 홈서버 반영 부분만 완료하며 승인 요청/승인·반려/확정·장부/원장·기초 잔액·전체 F03/F04/출시 체크는 후속이다. Hindsight는 기존30분 예약을 유지하고 수동 동기화하지 않았으므로 이 문서의 원격 반영은 미검증이다.
