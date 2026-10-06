# 개발 도구와 작업 기록

[문서 인덱스](README.md) · [전체 개요](PROJECT_DECISIONS.md)

Hindsight와 스킬 정리의 기존 작업 결과를 보관한다. 아래 서비스 응답·버전·런타임 조회 기록은 2026년 10월 5일에 정리한 원본 기록이며, 문서 분리 시점의 재검증 결과가 아니다. 개발 환경용 도구이며 회계 업무 기능의 완료 상태와 구분한다.

## 테스트 파일 IDE 오류 수리 — 2026-10-06

사용자 “이거도 고쳐 신경쓰이니까”(EvidencePreview.tsx 지정, 테스트 트리 캡처), 이어 “이것도”(database-foundation.test.ts 지정, Prisma.Decimal 오류 캡처)로 오류 수리를 요청했다. 영향 ID는 F08-16의 테스트 타입 검사 부분이다. 서버 빌드 tsconfig는 테스트를 제외하고 있어 별도 검사에서 namespace/UUID/unknown/Socket 청크의 타입 오류5건(4파일)이 발견됐다. 런타임·SQL·업무 정책을 바꾸지 않고 server/tests/tsconfig.json과 해당4테스트의 타입 표현을 수정한다. api-contract.test.ts의 decorator/import.meta 설정도 같은 테스트 구성으로 검사한다.

사전 검증 조건은 ① 테스트 전체 tsc 종료0 ② 수정 테스트의 실행 표현식/SQL 및 기존 계약 보존 ③ 제품 검증 묶음·문서 링크/UTF-8 통과다. IDE 화면에서 빨간 표시가 사라졌다는 사실은 CLI 검사와 구분하며 실제 IDE 관측이 불가능하면 미확인으로 남긴다. PDF 미리보기 구현과 이 타입 수리를 기능 완료로 혼합하지 않는다.

실행 결과: `npm --prefix server run check:tests`로24테스트 파일의 타입 검사(사전5오류 → 수정 후0오류)를 반복할 수 있다. [4파일 실행 코드 비교](../.artifacts/implementation-f03-evidence-preview/ide-types-runtime.json)는 TypeScript로 주석/타입을 제거한 JavaScript가 모두 동일하다. Decimal은 `InstanceType<typeof Prisma.Decimal>`로 표현하고 UUID fixture는 실제 API 입력 타입으로 명시했다. count 응답과 인코딩하지 않은 socket의 Buffer 타입도 명시했다. api-contract.test.ts는 코드 변경 없이 테스트 tsconfig의 ESNext·bundler·기존 decorator 옵션으로 검사했다. SQL 경고를 숨기는 inspection 비활성화는 하지 않았다.

변경 파일은 테스트4개·server/tests/tsconfig.json·server/package.json(check:tests 명령)·eslint.config.js(TSX 시험 포함)·이 문서다. PhpStorm의 실제 표시 갱신은 현재 도구가 네이티브 IDE 관측을 제공하지 않아 미확인이다. CLI 타입 오류 제거와 IDE 표시 자체 확인을 구분한다.

## Hindsight 시작 결과

사용자가 지정한 도구는 [vectorize-io의 Hindsight](https://github.com/vectorize-io/hindsight)이다. 기존 WSL Ubuntu 환경의 Hindsight 설치를 활용하여 Docker Desktop과 서비스를 시작했다. 이 회계 프로젝트에 새 Hindsight 서버를 설치한 작업은 아니다.

| 항목 | 확인 결과 |
| --- | --- |
| 기존 Compose 경로 | WSL의 `/home/jowoo/code/approid-desk/infra/hindsight/compose.yaml` |
| 기존 컨테이너 | `approid-desk-memory-hindsight-1` |
| 기존 설치 버전 | 시작 작업에서 `0.10.2` 확인 |
| API 상태 확인 | `http://127.0.0.1:8888/health` |
| 관리 화면 | `http://127.0.0.1:9999/` |
| 기존 MCP 주소 | `http://127.0.0.1:8888/mcp/approid-desk/` |
| MCP 확인 | 이전 시작 작업에서 초기화와 tools/list 성공 |

문서 작성 시 API와 관리 화면을 다시 요청하여 둘 다 HTTP 200임을 확인했다. 기존 MCP 메모리 뱅크는 `approid-desk`이며, 회계 프로젝트 전용 뱅크 연결과 retain 및 recall을 통한 저장·검색은 아직 확인하지 않았다. 이 문서를 Hindsight에 저장하는 작업도 수행하지 않았다.

## 스킬 정리와 작업 원칙

`Exceeded skills context budget` 경고는 초기 스킬 목록이 할당된 컨텍스트 예산을 넘어서 일부 설명이나 목록 항목이 생략될 때 발생한다. 스킬 자체의 실행 실패와는 구분된다. [스킬 문서](https://learn.chatgpt.com/docs/build-skills)

이전 정리 작업에서 전역 스킬 407개 중 20개를 선택하고 나머지 387개의 활성화를 해제했다. 설치 파일, 플러그인, MCP 연결을 삭제한 작업은 아니다. 아래 20개는 당시 선택 결과이며, 이후 추가되는 플러그인 스킬까지 포함한 현재 세션 전체 목록의 개수를 뜻하지 않는다.

| 용도 | 선택한 스킬 |
| --- | --- |
| 코드 작업과 검토 | karpathy-guidelines, investigate-first, review-agent |
| React와 화면 | vercel-react-best-practices, vercel-composition-patterns, ui-ux-pro-max, ecc:frontend-a11y |
| 테스트와 보안 | ecc:react-testing, ecc:security-review |
| 문서와 시각화 | documents:documents, pdf:pdf, spreadsheets:Spreadsheets, presentations:Presentations, visualize:visualize, imagegen |
| 환경과 도구 | computer-use:computer-use, deploy-to-vercel, openai-docs, skill-creator, skill-installer |

선택 결과와 검증 기록은 로컬 IDE 작업 폴더의 `skill_selection/selection.md`, `selection.json`, `verification.json`, `runtime-after.json`에 보관되어 있다. 전역 설정 백업은 `C:/Users/jowoo/.codex/config.toml.skills-backup-20261004T185342Z`이다. 당시 새 런타임 조회에서 407개 설치, 선택한 20개 활성화, 오류 없음이 확인되었다.

Karpathy 지침에 따라 가정을 드러내고 필요한 범위만 변경하며, 작업 전에 검증 조건을 정한다. 사용자가 제공한 완료 기준에 따라 검증 결과는 PASS, FAIL, UNVERIFIED로 보고한다. 설치된 스킬은 작업에 필요한 경우에 적용한다.

## 업무 문서 참조

회계 프로젝트 개발은 [인덱스](README.md)에서 필요한 기능 문서를 선택한다. 과거 계산·보고서 재현의 업무 기준은 [회계기준과 세법 변경 관리](features/13-accounting-tax-rules.md)와 [재무제표](features/07-financial-statements.md)에서 관리한다. Hindsight의 메모리 기록은 확정 장부와 규칙 버전 기록을 대신하지 않는다.

새 `atms` 뱅크의 개발 문서 등록·동기화는 [Hindsight 문서 동기화](HINDSIGHT_SYNC.md)를 참조한다. 위 `approid-desk` 주소와 작업 결과는 기존 환경의 기록이다.

2026-10-05 사용자 지시 “hindsight 동기화는 30분 마다 하는걸로 해”에 따라 로컬 Windows 예약 작업으로 30분마다 문서 변경분을 동기화한다. 실행 조건·로그와 등록 스크립트는 위 동기화 문서를 따른다. 문서 변경마다 즉시 실행하던 절차를 대체하며 업무 기능의 구현·결정 상태는 변경하지 않는다.
