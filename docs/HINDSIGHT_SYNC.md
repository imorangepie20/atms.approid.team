# Hindsight 문서 등록과 동기화

[문서 인덱스](README.md) · [개발 도구와 기존 기록](DEVELOPMENT_TOOLS.md)

구조화한 ATMS 개발 문서를 프로젝트 전용 `atms` 메모리 뱅크에 동기화한다. 저장소의 문서를 기준으로 삼고 Hindsight는 관련 문서를 찾는 보조 수단으로 사용한다. 문서 내용을 검색한 뒤 실제 파일과 적용 상태를 확인한다.

## 연결과 등록 범위

| 항목 | 설정 |
| --- | --- |
| API | `http://127.0.0.1:8888` |
| 관리 화면 | `http://127.0.0.1:9999/` |
| 프로젝트 뱅크 | `atms` |
| MCP 주소 | `http://127.0.0.1:8888/mcp/atms/` |
| 대상 파일 | 루트 AGENTS.md와 docs 폴더의 Markdown |
| 설정 파일 | [hindsight-docs.json](../infra/hindsight-docs.json) |
| 동기화 실행 | [sync-hindsight-docs.py](../infra/scripts/sync-hindsight-docs.py) |

기존 `approid-desk` 뱅크와 구분한다. API와 UI는 기존 로컬 Hindsight 서비스를 사용하며 새 서비스나 플러그인을 설치하는 구성은 아니다. 위 MCP 주소는 프로젝트 뱅크의 접근 주소이며 현재 에이전트의 MCP 도구 연결 설정을 변경한 결과는 아니다.

## 30분 자동 동기화

사용자 확정일: 2026-10-05. 근거: “hindsight 동기화는 30분 마다 하는걸로 해”. 문서 변경마다 즉시 실행하던 절차를 30분 예약 실행으로 대체한다.

| 항목 | 설정 |
| --- | --- |
| 실행 위치 | 개발 PC의 Windows 작업 스케줄러 |
| 작업 이름 | `ATMS-Hindsight-Docs-Sync` |
| 간격 | 등록 30분 뒤부터 30분마다, 종료일 없음 |
| 실행 계정 | 등록한 Windows 사용자, 로그인 중 실행; 비밀번호 저장 없음 |
| 실행 조건 | PC가 켜져 있고 사용자가 로그인했으며 로컬 Hindsight가 실행 중이어야 함 |
| 놓친 실행 | 실행 가능한 상태가 되면 실행; PC를 강제로 깨우지 않음 |
| 중복 방지 | 예약 작업 `IgnoreNew`와 실행기 파일 잠금 |
| 실행 결과 | `.artifacts/hindsight-sync/last-run.json`, `latest.log` |

[등록 스크립트](../infra/scripts/register-hindsight-sync-task.ps1)는 현재 PC의 Python 경로와 저장소 경로를 사용한다. [실행기](../infra/scripts/run-hindsight-sync.py)는 기존 동기화 명령과 `--check`를 순서대로 실행하고 둘 다 성공해야 성공으로 기록한다. 서비스 중단·시간 초과·검사 실패는 실패로 남기며 다음 주기에 재시도한다. 실제 로그 확인 전에는 자동 동기화 성공을 가정하지 않는다.

```powershell
powershell.exe -NoProfile -File infra/scripts/register-hindsight-sync-task.ps1
Get-ScheduledTaskInfo -TaskName 'ATMS-Hindsight-Docs-Sync'
Get-Content .artifacts/hindsight-sync/last-run.json
Get-Content .artifacts/hindsight-sync/latest.log
```

등록 스크립트를 다시 실행하면 이 프로젝트 작업의 시작 시각과 경로를 갱신한다. 중지하려면 `Disable-ScheduledTask -TaskName 'ATMS-Hindsight-Docs-Sync'`, 다시 켜려면 `Enable-ScheduledTask -TaskName 'ATMS-Hindsight-Docs-Sync'`를 사용한다. Hindsight 서버 자체의 자동 시작이나 홈서버 예약 작업은 설정하지 않는다.

아래 Windows 반복 트리거와 중복 실행 정책을 사용한다. [Microsoft 반복 트리거 문서](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasktrigger), [Microsoft IgnoreNew 문서](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-multipleinstancespolicy-settingstype-element).

## 수동 등록 및 동기화 검사

저장소 루트에서 실행한다. Python 표준 라이브러리를 사용하며 로컬 Hindsight가 실행 중이어야 한다.

```powershell
python infra/scripts/sync-hindsight-docs.py --dry-run
python infra/scripts/run-hindsight-sync.py
python infra/scripts/sync-hindsight-docs.py --check
```

`--dry-run`은 로컬 파일 목록만 표시하고 네트워크와 저장을 사용하지 않는다. 기본 실행은 뱅크가 없으면 만들고, 원문·SHA-256·경로·태그·검색 메모리가 일치하지 않는 문서만 등록한다. `--check`는 원격 원문과 메타데이터 및 검색 가능한 메모리 존재를 검사하는 읽기 전용 명령이다.

문서 경로에서 고정 document_id를 생성하고 `source_path`, `sha256`, 프로젝트 태그와 `source:문서경로` 태그를 기록한다. 기능 문서에는 인덱스의 고정 ID에 대응하는 `feature:F01`부터 `feature:F13`까지의 태그도 붙인다. 변경 문서는 같은 ID에 replace 방식으로 갱신한다. Hindsight API의 replace는 이전 문서 및 메모리를 대체하므로 과거 개발 문서 이력은 저장소에서 관리한다. 회계 장부와 확정 보고서의 이력 보존은 별도 업무 요구사항이다.

원문 청크를 그대로 저장하는 `chunks` 모드를 사용한다. 공식 문서는 이 모드에서 사실 추출을 위한 LLM 호출과 추출 메타데이터를 생략한다고 설명한다. 문서 경로와 해시는 동기화 클라이언트가 제공한다. [Hindsight retain 문서](https://hindsight.vectorize.io/developer/retain)

비동기 등록은 완료 상태까지 기다린 후 원문을 다시 대조한다. 중간 실패 또는 시간 초과 시 완료로 보고하지 않는다. 재실행 전에 진행 중 작업의 완료 여부를 확인한다. 파일 삭제·이동으로 남은 원격 문서는 검사에서 알려주며 자동 삭제하지 않는다.

## 변경 후 참조와 검증

검색은 `POST /v1/default/banks/atms/memories/recall`로 요청할 수 있다. 인덱스에서 작업 기능을 고르고 프로젝트 태그와 기능 태그로 범위를 제한한다. 아래 예시는 F13의 회계기준·세법 변경 문서를 검색한다. 재무제표는 `feature:F07`, 배포는 `feature:F12`, 인덱스 자체는 `source:docs/README.md`를 사용한다. 응답의 `document_id` 또는 `metadata.source_path`를 원본 문서와 연결한다.

```powershell
$body = @{ query = '과거 확정본과 세법 개정 규칙'; tags = @('atms', 'project-docs', 'feature:F13'); tags_match = 'all_strict'; budget = 'mid'; max_tokens = 4096 } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:8888/v1/default/banks/atms/memories/recall' -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

- 개발 문서 변경분은 30분 예약 실행으로 반영한다. 변경마다 수동 실행하지 않는다. 설치·변경 검증 또는 사용자가 명시적으로 즉시 실행을 요청한 경우 위 실행기를 수동으로 사용할 수 있다.
- 자동 동기화 전에는 Hindsight가 이전 문서일 수 있으므로 저장소 원문을 우선 참조한다. 같은 내용으로 검증 실행하면 `changed: 0`이 나오는지 확인한다.
- Hindsight 검색 결과의 문서 경로에서 [인덱스](README.md)와 관련 기능 문서로 이동한다.
- 검색 결과가 원본의 최신 상태·버전·확정 여부를 대신하지 않도록 실제 파일을 확인한다.
- 예약 작업이 실행 명령을 30분마다 호출한다. 백그라운드 파일 감시는 설정하지 않는다.

## 구현 후 검증 기준

- [ ] 대상 파일의 원격 원문, 경로와 SHA-256이 로컬과 일치한다.
- [ ] 각 문서의 memory_unit_count가 0보다 크고 문서 검색 결과를 확인한다.
- [ ] 동일 내용 재동기화에서 변경 문서가 0개이고 중복 등록이 없다.
- [ ] 문서 내용 변경 후 동일 ID의 원문과 검색 내용이 갱신된다.

동기화 성공 여부는 실행 출력과 원격 조회 결과로 판단한다. 이 문서의 체크 목록 자체는 실행 결과 기록이 아니다.
