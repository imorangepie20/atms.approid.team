# F03-03 증빙 원본 미리보기 설계와 검증

[문서 인덱스](../README.md) · [증빙 요구사항](03-evidence.md) · [완료한 첫 화면](03-evidence-browser-design.md) · [구현 계획](../IMPLEMENTATION_PLAN.md)

상태: **사용자 위임에 따른 PDF.js 전환·배포 및 미리보기 묶음 6조건 PASS**. 확정일: 2026-10-06. 영향 ID: F03-03·05 및 F08-14·15의 증빙 상세 화면 부분. F03 전체 기능 완료와 구분한다.

사용자 확정 근거: V1~V5·10파일·6검증 조건을 제시한 직후 사용자 “확정”(src/App.tsx 지정, 2026-10-06)으로 해당 범위를 선택했다. 기존 P-01·02·03·04·07·10, 서버 E1~E8와 첫 화면 B1~B7을 재사용한다. PDF용 새 라이브러리 추가는 이 승인에 포함되지 않는다. 실행 중 문서 갱신이 반영되지 않은 사실을 마지막 대조에서 발견하여 이 기록을 바로잡았다. 구현 전에 기록해야 한다는 게이트의 순서가 지켜졌다고 소급 보고하지 않는다.

## 개발과 배포 검증 방식

사용자 지시(2026-10-06): “개발중에 자꾸 포트 새로 열어서 짜증나서 배포해서 테스트할려고 개발중 배포한거야”, 이어 “개발 이어해”. 개발은 계속하고 브라우저 검증은 홈서버의 기존 `https://atms.approid.team`, `127.0.0.1:19080`을 사용한다. 배포 연결 완료를 개발 완료로 취급하지 않는다. 새 로컬 미리보기 포트를 시작하지 않는다. 빌드·lint·포트가 필요 없는 테스트는 로컬에서 묶어 실행할 수 있다. 홈서버 반영 전 기존 웹 파일을 보존하고, 반영 후 같은 주소에서 검증한다.

## 착수 전 계약과 제안 이유

- `EvidenceDetail.tsx`는 상세 11필드와 원본 다운로드만 제공한다.
- `evidenceApi.original`은 세션 쿠키와 `cache: no-store`로 원본 바이트를 받으며 10MiB 상한을 확인한다. 취소용 AbortSignal 인자는 아직 없다.
- 서버 `GET /api/companies/:companyId/evidence/:evidenceId/original`은 현재 세션·회사·`evidence.read`를 검사하고 attachment 응답을 반환한다. 이 API를 유지하면서 브라우저에서 받은 Blob을 표시하는 방식이 후보이다.
- 증빙 페이지는 회사·증빙 변경과 권한 재확인 시 상세를 해제한다. 미리보기 역시 이 수명에 맞춰 원본을 폐기해야 한다.

## 사용자 확정 선택값 V1~V5

| ID | 확정 범위 | 영향 |
| --- | --- | --- |
| V1 | 증빙 상세에 명시적인 “원본 미리보기”·“미리보기 닫기” 조작을 추가한다. 상세를 열 때 자동으로 원본을 받지 않는다. | 기존 상세·다운로드와 같은 화면을 사용한다. 별도 경로나 App.tsx 라우팅 추가는 필요 없다. |
| V2 | 기존 허용 형식인 PDF·JPEG·PNG를 지원한다. 이미지는 img, PDF는 사용자 라이브러리 선택 위임에 따라 PDF.js worker/canvas로 표시한다. | 원본을 외부 뷰어에 보내지 않는다. 최초 격리 iframe 후보의 표시 실패 기록은 보존한다. 같은 출처의 파서·worker·보조 자원을 PDF를 열 때만 사용한다. |
| V3 | 클릭마다 기존 보호 API로 원본을 조회한다. 응답 MIME과 상세 형식의 일치를 확인하고 Blob URL은 컴포넌트 메모리에만 둔다. | 서버 권한·attachment 계약·비공개 R2·원본 보존 정책과 DB 모델을 변경하지 않는다. HTML/SVG 등 비허용 응답은 렌더링하지 않는다. |
| V4 | 닫기·다른 증빙/회사 선택·필터/페이지 변경·권한 상실·로그아웃·화면 이탈 때 요청을 취소하고 Blob URL을 해제한다. 늦은 응답을 표시하지 않는다. | 원본 API에 선택적 AbortSignal을 추가한다. 기존 다운로드 호출은 유지한다. 401/403은 기존 인증/권한 흐름, 기타 오류는 안전한 안내·명시적 재시도로 처리한다. |
| V5 | 기존 HUD·테마·44px 조작 영역을 유지하고 제목·이미지 대체 텍스트·상태/오류 안내·키보드 조작을 제공한다. | 375/768/1440px 화면과 긴 파일명, 실제 PDF 페이지·이미지 표시를 기존 홈서버 주소에서 검증한다. OCR·전표 연결·파일 교체/삭제는 이 묶음의 후속이다. |

## 확정 후 파일 목록과 목적

| 구분 | 파일 | 목적 |
| --- | --- | --- |
| 수정 | `src/lib/api.ts` | 원본 조회의 선택적 AbortSignal 및 미리보기 응답 형식 확인 지원 |
| 수정 | `src/components/evidence/EvidenceDetail.tsx` | 명시적 미리보기/닫기와 상태 연결 |
| 생성 | `src/components/evidence/EvidencePreview.tsx` | 형식별 표시·원본 요청 취소·URL 해제·오류/접근성 |
| 수정 | `tests/e2e/evidence.spec.ts` | 형식·취소·늦은 응답·권한·다운로드 회귀 행동 검증 |
| 생성 | `tests/e2e/evidence-preview.deployed.config.ts` | 기존 HTTPS 주소 사용, webServer 없음, 테스트용 API mock 범위 분리 |
| 수정 | `docs/features/03-evidence-preview-design.md` | 실제 선택값·코드 설명·실행 근거 |
| 수정 | `docs/features/03-evidence.md` | 상세 미리보기 구현 상태와 후속 경계 |
| 수정 | `docs/README.md` | 참조 경로 |
| 수정 | `docs/ROADMAP.md` | 개발 순서와 현재 상태 |
| 수정 | `docs/IMPLEMENTATION_PLAN.md` | 영향 ID·부분 완료 근거와 체크 판정 |

총 10개 파일 항목이다. `App.tsx`는 사용자가 지정한 검토 파일로 IDE 열기 명령을 실행했으며 현재 보호 경로를 재사용한다. 신규 설정은 기존 Playwright 기본 설정과 달리 서버를 띄우지 않는 별도 시험 설정이다. UI 상호작용은 CUA 브라우저 도구로 실행한다. 로컬 미리보기 서버를 자동으로 시작하는 기존 E2E 명령은 이번 검증에 사용하지 않는다.

배포용 빌드·사전 웹 파일 보존·비밀 없는 웹 산출물 전송·결과/캡처는 `.artifacts/implementation-f03-evidence-preview/`에 기록한다. 실제 시나리오에 사용할 가상 증빙 원본의 업로드는 확정할 구현 검증 범위에 포함한다. 기존 사용자 증빙을 삭제하거나 서버/DB를 초기화하지 않는다.

## 구현 후 객관적 검증 조건 6개

1. V1~V5의 실제 선택값·사용자 근거·일자·영향 ID와 파일 목록, P-07/권한/기존 경로 보존을 확인한다.
2. PDF·JPEG·PNG의 실제 표시와 명시적 열기/닫기, 비허용/불일치 MIME 거부 및 기존 다운로드 바이트 보존을 확인한다.
3. 회사·증빙 전환·필터/페이지 변경·닫기·화면 이탈의 취소/URL 해제, 늦은 응답 비노출과 원본의 영구 저장 부재를 확인한다.
4. 401/403/404/503/연결 오류와 형식 오류를 확인하고 권한 재확인/로그인·명시적 재시도·민감 정보 비노출을 검증한다.
5. 375/768/1440px에서 가로 넘침·키보드·label/대체 텍스트·상태/오류·44px 조작과 실제 PDF/이미지 캡처를 확인한다.
6. build/lint·Appearance 및 관련 행동 테스트를 묶어 실행한다. 기존 홈서버에 빌드 산출물을 반영한 뒤 같은 HTTPS 주소·19080 포트·현재 회사/기간/기존 증빙 보존을 확인한다. 새 로컬 웹 서버 포트가 생기지 않았음을 확인한다.

실행 결과는 아래 기록과 산출물로 판정한다. 첫 비통과가 2개를 넘으면 가장 앞선 실패 계층에서 중단한다. 상위 F03 체크는 전체 해당 조건 검증 후 별도 판정한다.

## 제안 준비의 검증 조건 3개

1. 계획서 F03-03과 기존 P-07/원본 API/화면의 대조 근거 및 V1~V5가 일치한다.
2. 추천·확정 대기·미실행을 구분하고 파일 10개·구현 검증 6개·기존 배포 검증 원칙을 기록한다. 변경 문서의 로컬 링크와 UTF-8을 확인한다.
3. 준비 전후 코드/설정 7개 SHA-256과 P/F/G 체크 행 139개가 동일하다.

## PDF 렌더러 변경 — 사용자 위임으로 확정

[MDN iframe 문서](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#embedding_pdfs)는 sandbox가 브라우저의 PDF 표시를 막을 수 있다고 설명한다. 실제 배포 Chrome에서도 격리 iframe이 차단됐다. 사용자 지시(2026-10-06): “성능좋은 라이브러리 추가는 네 재량이야”(src/App.tsx 지정). 이 지시로 라이브러리 선택·추가를 에이전트에 위임했고 직전 PDF.js 변경안을 진행한다. 영향 ID: F03-03·05/F08-14·15. 기존 보호 API를 유지하고 PDF.js 6.4.299를 PDF 열기 시에만 불러온다. worker·글꼴·CMap·WASM은 앱의 같은 출처에서 제공한다. 화면/DB/서버 권한 정책을 새로 선택하는 위임으로 확대하지 않는다.

구현 파일은 기존10개에 package.json·package-lock.json(의존성), vite.config.ts(로컬 렌더링 자원 배포), src/components/evidence/PdfCanvasPreview.tsx(한 페이지 canvas·이동·작업 정리), tests/evidence-preview.test.tsx(실제 React/DOM의 요청·URL 수명/권한·재시도 시험)를 추가하여 총15개다. 컴포넌트 시험에 필요한 @testing-library/react와 jsdom은 개발 의존성으로만 추가한다. 기존 6검증 조건 전체를 새 수정 묶음으로 다시 실행한다. 실패한 첫 기록을 보존하고 재검증 결과를 별도로 남긴다.

## 첫 구현 흐름과 당시 제한

- `src/lib/api.ts`의 original은 선택적 AbortSignal을 fetch에 전달하고 요청한 상세 MIME과 응답 MIME의 일치를 확인한다. 기존 두 인자 다운로드 호출은 유지한다.
- `EvidenceDetail.tsx`의 미리보기 버튼은 명시적 클릭으로만 Preview를 생성한다. 닫기와 기존 상세 해제는 컴포넌트를 제거한다.
- `EvidencePreview.tsx`는 요청 시작 → MIME 검증 → 현재 상세 확인 → 메모리 Blob URL 생성 → 이미지 또는 PDF 후보 표시 순서다. cleanup에서 요청을 취소하고 URL을 해제한다. 401/403은 부모 콜백, 나머지는 안전한 오류 메시지와 명시적 재시도로 처리한다.
- 이미지 표시와 닫기는 실제 화면에서 확인했다. 모든 전환의 URL 해제·늦은 응답 차단 및 401/403의 화면 전환은 구현되어 있으나 런타임 검증이 끝나지 않았다. PDF 후보는 실제 표시 실패다. 주석이나 다운로드 안내를 PDF 구현 완료 근거로 사용하지 않는다.

## 첫 구현 검증과 중단 기록 — 2026-10-06

[6조건 집계](../../.artifacts/implementation-f03-evidence-preview/first-gate-results.json): **2 PASS / 1 FAIL / 3 UNVERIFIED, 미완료**. 첫 비통과 4개로 수리를 중단한다. 가장 앞선 문제는 확정 기록 갱신이 구현 전에 유지되지 않은 과정, PDF 후보의 sandbox 호환성, 브라우저 검증 도구의 계측·화면 크기 제어다. 개별 증상 수정이나 sandbox 완화로 우회하지 않는다.

| 조건 | 상태 | 객관적 근거 |
| --- | --- | --- |
| 1. 선택값·기존 계약 보존 | PASS | 사용자 확정 근거는 위 기록. [보존 결과](../../.artifacts/implementation-f03-evidence-preview/preservation-results.json): 보호 파일 74개·체크 행 139개 동일. 기록이 구현 후 바로잡힌 과정 오류는 위에 명시했다. |
| 2. 형식·열기/닫기·다운로드 바이트 | FAIL | [실제 표시](../../.artifacts/implementation-f03-evidence-preview/live-results.json): JPEG/PNG 640×400 및 닫기 PASS, [PDF 차단 화면](../../.artifacts/implementation-f03-evidence-preview/pdf-native-blocked.png) FAIL. [API 시험](../../.artifacts/implementation-f03-evidence-preview/original-api.log) 13/13으로 MIME·바이트 보존 확인. 브라우저 다운로드 완료는 대기 시간 초과로 미확인. |
| 3. 취소·URL 해제·늦은 응답 | UNVERIFIED | API 요청 취소 시험은 PASS. 모든 문맥 전환의 URL 해제·늦은 응답은 런타임 미확인. blob 별도 탭은 브라우저 도구 정책으로 차단됐고 계측 API도 지원되지 않았다. |
| 4. 오류·권한 전환·재시도 | UNVERIFIED | [오류 화면 시험](../../.artifacts/implementation-f03-evidence-preview/fault-results.json): MIME/404/503/offline PASS. API 401/403 시험은 PASS이나 해당 화면 전환 및 완전한 재시도 시나리오는 추가 계측 참조 만료로 미확인. |
| 5. 반응형·접근성 | UNVERIFIED | [화면 크기 결과](../../.artifacts/implementation-f03-evidence-preview/responsive-results.json): 요청 375/768/1440과 달리 관측 너비는 모두 1455px. 이를 성공한 반응형 캡처로 보고하지 않는다. 키보드 전체 흐름과 PDF 배치도 남았다. |
| 6. 묶음 검사·배포·데이터/포트 | PASS | [로컬 묶음](../../.artifacts/implementation-f03-evidence-preview/local-results.json) build/lint 종료0, Appearance16/API13 PASS. 새 E2E 파일 타입 검사 종료0(행동 실행은 미실행). HTTPS HTML/ready/asset200·로컬 해시 일치, 업무5테이블 지문 동일·검증 증빙3개 추가·새 로컬 리스너0. [서비스](../../.artifacts/implementation-f03-evidence-preview/services-after.log) healthy·기존19080 유지. |

정적 웹 파일만 반영했고 API/DB를 재기동하거나 migration을 적용하지 않았다. 이전 웹 파일은 홈서버 `/mnt/external-ssd/backups/johae-server/atms/pre-evidence-preview-20261006/web-before.tar`에 보존했다. 현재 이미지 화면은 [캡처](../../.artifacts/implementation-f03-evidence-preview/current-image-preview.png)로 확인한다. 새 E2E 10개는 작성·타입 검사만 했고 실행 통과 개수로 세지 않는다. PDF.js 변경안과 검증 도구 계층의 복구를 확정한 뒤 같은 전체 6조건으로 다시 판정해야 한다.

## 브라우저 재검증 — 2026-10-06

사용자 “다음”(src/App.tsx 지정)으로 중단 계층의 조사·기존 승인 범위 검증을 재개했다. PDF.js 선택을 명시적으로 확정한 답변은 아직 없어 제품 코드·패키지를 변경하지 않았다. 이번 조사 단위의 사전 조건은 ① 기존 승인/미확정 범위 대조 ② 실제 화면 너비·가로 넘침·이미지/키보드 동작 확인 ③ 보호 파일·체크 및 문서 보존 대조다.

탭을 현재 브라우저 세션에 다시 연결한 뒤 viewport를 적용하고 CSS 전환 후 관측했다. [새 관측 결과](../../.artifacts/implementation-f03-evidence-preview/recovered-responsive.json)는 window.innerWidth 375/768/1440, clientWidth와 scrollWidth 각각 367/367·760/760·1432/1432로 가로 넘침이 없다. 8px 차이는 스크롤바를 제외한 본문 너비다. PNG 원본이 세 크기 모두 표시되고 대체 텍스트와 두 조작 버튼의 44px 높이를 확인했다. Enter 키로 닫기/열기도 확인했다. 모바일의 첫 관측에는 CSS 전환 중 가로 넘침이 보였으나 전환 후 없어졌다. 원인을 제품 CSS 결함으로 단정하거나 수정하지 않았다.

[375px 캡처](../../.artifacts/implementation-f03-evidence-preview/recovered-375.png) · [768px 캡처](../../.artifacts/implementation-f03-evidence-preview/recovered-768.png) · [1440px 캡처](../../.artifacts/implementation-f03-evidence-preview/recovered-1440.png)를 보존했다. 임시 viewport는 reset했다. 이전 첫 검증 기록은 유지한다. 이번 결과만으로 PDF 배치·모든 접근성 조건·전체 6조건을 PASS로 변경하지 않는다. PDF 렌더러와 수명/권한 전환 검증은 여전히 남았다.

## PDF.js 수정 묶음의 검증 완료 — 2026-10-06

위 라이브러리 위임을 먼저 기록하고 PDF.js 6.4.299·개발용 RTL/jsdom을 설치했다. [Mozilla 예제](https://mozilla.github.io/pdf.js/examples/)와 설치 버전의 타입 선언을 대조했다. 초기 로컬 단계에서 build1FAIL(설치6버전에 없는 isEvalSupported 옵션)·컴포넌트 검사1FAIL(재사용 Response·버튼 이름 fixture)이 나왔고 lint는 PASS였다. 두 실패 원인을 수정한 뒤 전체 로컬 묶음을 반복해 통과했다. TypeScript로 새 E2E/컴포넌트 시험도 검사했다. 추가 E2E10개는 배포 브라우저 자동 실행이 아니라 작성·타입 검사까지이며 실행 통과로 세지 않는다.

[최종 6조건](../../.artifacts/implementation-f03-evidence-preview/final-gate-results.json)은 **6 PASS**다. 수명·오류 분기는 실제 React/DOM 시험, 실제 PDF·이미지·화면 크기는 배포 Chrome, 계약/DB 보존은 파일·행 지문으로 확인했다. 시험 대역의 결과를 실제 권한 변경이나 운영 DB 쓰기로 표현하지 않는다.

| 조건 | 상태 | 실행 근거 |
| --- | --- | --- |
| 1. 위임·범위·계약 보존 | PASS | 위 사용자 원문·일자·영향ID·15파일 기록. App/업무페이지/서버/DB/인프라 보호74파일 동일, 계획139체크 동일. IDE 타입 수리는 별도 사용자 요청/문서로 구분한다. |
| 2. PDF/JPEG/PNG·열기/닫기·바이트 | PASS | [배포 Chrome 결과](../../.artifacts/implementation-f03-evidence-preview/pdfjs-live-results.json): PDF1·2페이지/Enter 이동·닫기, PNG/JPEG640×400. API13/13: MIME 거부·기존 다운로드 바이트 동일. 브라우저의 실제 다운로드 완료를 새로 확인했다고 주장하지 않는다. |
| 3. 요청·URL·worker 수명/저장 | PASS | [React 시험29/29](../../.artifacts/implementation-f03-evidence-preview/components.log): 회사/증빙/필터/앞뒤 페이지·닫기/화면 제거의 abort·revoke·늦은 결과 차단, Query/localStorage/sessionStorage 원본 미저장, PDF load/render 취소와 destroy. 로그아웃의 부모 제거는 AuthContext.expire와 App.RequireSession 소스에 대조했다. |
| 4. 안전한 오류·인증/권한·재시도 | PASS | React 시험:401 expire·403 회사 권한 재조회/상세 제거,404/503/offline/MIME·이미지 오류/손상PDF·명시적 재시도·PRIVATE_MARKER 비노출. 기존 원본 API13/13 통과. |
| 5. 화면·접근성 | PASS | 실제375/768/1440, 가로 clientWidth=scrollWidth, canvas block·버튼44px, PDF 대체 이름·텍스트·Enter 페이지 이동/닫기. [PDF375](../../.artifacts/implementation-f03-evidence-preview/pdfjs-375.png)·[PDF768](../../.artifacts/implementation-f03-evidence-preview/pdfjs-768.png)·[PDF1440](../../.artifacts/implementation-f03-evidence-preview/pdfjs-1440.png)와 이미지/Enter 재검증 기록. |
| 6. 묶음 검사·배포·자료 보존 | PASS | [로컬 종료 코드](../../.artifacts/implementation-f03-evidence-preview/local-results.json): build/lint0·Appearance16·React29·API13. 프런트 시험 타입 검사0·서버 테스트24파일 타입 검사0. HTTPS/ready/asset200·해시일치, 업무5테이블/이전샘플3지문 동일. |

최종 실행 흐름: EvidenceDetail 버튼 → EvidencePreview의 보호 API/MIME 검증 → PDF Blob 또는 이미지 메모리 URL → PdfCanvasPreview에서 바이트와 파서를 함께 준비 → 한 페이지 render → 페이지 이동 때 이전 render.cancel → 닫기 때 loadingTask.destroy. PDF.js 본체는 약484kB(gzip145kB)의 별도 chunk이며 PDF를 열기 전에 페이지의 modulepreload/script 목록에 없다. 작은 표시 컴포넌트만 기존 엔트리에 포함한다. worker 약1264kB는 같은 출처의 .js로 출력하여 기존 Nginx MIME에 맞췄다. [파서/worker/WASM/한글 CMap 응답](../../.artifacts/implementation-f03-evidence-preview/pdfjs-assets.json)은 모두200이며 JavaScript/WASM MIME도 확인했다.

한 페이지 canvas만 사용하고 HiDPI 최대2배·버퍼400만 픽셀로 제한한다. 파서의 글꼴/CMap/WASM/ICC를 버전 경로에 복사해 CDN 없이 조회한다. XFA·주석 동작을 표시하지 않고 텍스트는 React 문자열로 보조 제공한다. 라이브러리 로드/손상·암호 파일 오류는 안전한 안내와 명시적 재시도를 제공한다.

배포는 정적 웹 파일만 반영했다. [새 백업/반영 기록](../../.artifacts/implementation-f03-evidence-preview/rollout-pdfjs.log)과 [최종 화면](../../.artifacts/implementation-f03-evidence-preview/pdfjs-final.png)을 보존했다. API/DB 설정·R2 원본·업무 정책은 그대로이며 이전 실패 집계는 삭제하지 않는다. 전체 F03의 전표 연결/원장 경로·OCR·운영 종합 검증은 후속이다. 사용자 요청의 IDE 오류 수리는 [개발 도구 기록](../DEVELOPMENT_TOOLS.md#테스트-파일-ide-오류-수리--2026-10-06)으로 참조한다.
