# 배포와 홈서버 운영 개발 문서

기초 잔액·확정·원장 화면 배포 완료(2026-10-07): 최초 릴리스 `ec4ebc7-ledger-ui` 뒤 실제 운영 검증에서 확인한 POSTED 안내 문구를 사용자 추가 확정에 따라 수리하고 `ec4ebc7-ledger-ui-copyfix`로 재배포했다. 외장 SSD `pre-ec4ebc7-ledger-ui-copyfix`의 DB·웹·서버·API 이미지 백업 SHA-256과 임시 DB 복원을 확인했으며, 가상 검증 자료를 포함한 28개 업무 테이블 행 지문 `aa8532a23be6ef83d4a817a4648bb164505a2fa63a0d45a4313052eeab59ac6f`가 적용 전후 일치했다. 16 migration·30테이블, 모든 서비스 healthy/tunnel running, 외부 ready와 `/accounting/ledger` HTTP200, 미인증 원장 API401, 배포 Playwright12/12와 로컬/배포 index SHA-256 `eff228f33a22a619f655ba036d9871eee4af9f62a19fb57c936b27a438a0e4fe` 일치를 확인했다. 실제 가상 회사의 0원/비영 기초·일반전표·분개장·계정별 원장·PDF 원본 UI/API/DB 대조도 통과했다.

기초 잔액·회사 폼·Sidebar 배포 완료(2026-10-07): 커밋 `dd06805`를 `origin/main`에 푸시하고 `/home/approid/atms.approid.team`에 반영했다. 외장 SSD `/mnt/external-ssd/backups/johae-server/atms/pre-dd06805-20261007`에 DB·웹·서버·인프라·API 이미지 백업을 만들고 SHA-256을 확인했다. 백업을 임시 DB로 복원한 뒤 15·16번째 migration을 적용해 16 migration·30테이블과 기존 27개 업무 테이블 지문 보존을 확인한 후 운영에 적용했다. API/app/PostgreSQL/ClamAV healthy, tunnel running, 내부·외부 ready와 `/companies` HTTP200, 미인증 기초 잔액 API401, 로컬/배포 web index SHA-256 `723c03734bde3bfd7cacc4351a4ea1bd01f061f87f5f5866c997b2434e360ae7` 일치다. Chrome 운영 화면에서 회사 등록 4필드가 비어 있고 `autocomplete`/`name` 속성이 확정값과 일치하며 서브메뉴 간격이 줄어든 것을 확인했다.

첫 두 사전 점검은 운영 적용 전 기존 migration 줄바꿈 체크섬 차이에서 중단했고, 세 번째 준비 점검은 격리 DB의 새 열 때문에 전체 JSON 지문이 달라져 운영 적용 전 중단했다. 기존 SQL의 정규화 내용 동일성을 확인하고 이미 적용된 운영 migration 바이트를 보존했으며, 기존 열만 비교하도록 지문 범위를 바로잡은 뒤 백업·복원·격리 적용·운영 적용 전체를 다시 통과했다. 어느 중단에서도 운영 DB나 컨테이너를 변경하지 않았다.

승인 화면/서버 후속 배포 부분 완료(2026-10-07): 사용자 “확정”(api.ts 지정)에 따라 [A1~A8](05-approval-browser-design.md)의 운영 SSD 백업·격리 DB 복원 시험·승인 SQL/API/정적 화면·가상 회사 실제 브라우저 검증을 마쳤다. [최종 K1~K8](../../.artifacts/implementation-f05-approval-browser/results.json)은 모두 PASS다. 완료 migration14·테이블29, 기존 업무25테이블 행 지문 보존, 공개 ready/승인 화면 HTTP200·미인증 승인 API401·빌드와 배포 index SHA-256 일치를 확인했다. 전체 F12 완료 체크는 후속 범위의 운영 검증을 기다린다.

[문서 인덱스](../README.md) · [전체 개요](../PROJECT_DECISIONS.md) · [개발 순서와 미정 사항](../ROADMAP.md)

문서 ID: F12

상태: SSH·전용 웹/API/DB 기반 구축, 외부 DNS·터널 및 업무 복원 검증 전

이 문서의 상세 기능, 데이터와 완료 기준은 현재 요구사항을 개발 단위로 풀어쓴 설계안이다. 구현 후 검증 기준은 아직 실행 결과가 아니다. 사용자 확정사항과 기존 적용 기록은 별도로 표시한다.

실제 구축·기동 명령과 검증 기록은 [환경 구축 문서](../ENVIRONMENT_SETUP.md)를 기준으로 한다. 아래 기존 결정 기록과 구분하여 최신 상태를 확인한다.

## 목적과 범위

사용자가 지정한 Zorin OS 홈서버에서 서비스를 배포하고 복구 가능하게 운영한다.

- Docker·Nginx와 Cloudflare Tunnel 배포
- 서비스 재시작, 백업·복원과 운영 확인

## 입력과 결과

| 구분 | 내용 |
| --- | --- |
| 입력 | 배포 버전, 서버 접속 대상, 도메인과 필요한 환경 설정 |
| 결과 | 서비스 접속 결과, 배포 기록과 복원 검증 결과 |

## 데이터와 처리 규칙

- 서버·도메인·저장소 지정값은 아래 확정 요구사항을 따른다.
- 기존 다른 프로젝트의 배포 설정을 실제 배포 전에 정리한다.
- 웹·API·DB의 연결과 비공개 저장소 및 자격 증명 관리를 설계한다.
- 장비 사양·사용량 확인 후 운영 규모와 비용을 산정한다.
- 기존 DEPLOYMENT.md는 참고 자료이며 새 도메인용 실행 절차로 검증되지 않았다.

## 기존 결정과 상세 요구사항

아래 내용은 종합 문서에서 옮긴 결정 및 요구사항이다. 기술 버전과 적용·검증 기록의 기준일은 2026년 10월 5일이며, 이번 문서 분리 작업에서 기능이나 외부 서비스 상태를 재검증한 결과는 아니다.

### 확정한 배포 환경과 저장소

사용자가 직접 구축한 홈서버에 배포한다. 아래 접속 대상, 도메인과 저장소는 사용자 지정값이며, 연결 가능 여부나 현재 외부 공개 상태를 확인한 결과는 아니다.

| 항목 | 확정값 |
| --- | --- |
| 서버 운영체제 | Zorin OS |
| 서버 성격 | 사용자가 직접 구축한 홈서버 |
| SSH 접속 대상 | `approid@192.168.219.174` |
| 서비스 도메인 | `atms.approid.team` |
| 외부 연결 | Cloudflare Tunnel |
| Git 저장소 | `https://github.com/imorangepie20/atms.approid.team.git` |

배포 설계는 Cloudflare Tunnel을 통해 홈서버의 Nginx로 요청을 전달하고, 향후 웹 정적 파일과 NestJS API를 같은 서비스 도메인 아래 제공하는 방향을 권장한다. PostgreSQL은 서버 내부에서 사용하는 구성으로 제안한다. 환경 구축에서 `/api` 프록시와 비공개 PostgreSQL을 구현했다. 업무 API와 외부 HTTPS는 후속 검증 대상이다.

기존 배포 문서에는 다른 프로젝트 이름과 도메인이 남아 있으므로 실제 배포 준비 단계에서 저장소 주소, 배포 경로, Compose 프로젝트 이름, 터널 호스트 설정을 이번 프로젝트 기준으로 정리해야 한다. 환경 구축에서 SSH를 확인하고 로컬 Git 원격 주소를 사용자 지정 저장소로 변경했다. 전용 배포 경로는 `/home/approid/atms.approid.team`, Compose 프로젝트는 `atms`, 로컬 Nginx 포트는 19080이다. Cloudflare DNS·터널은 연결 대기 중이다.

2026-10-06 사용자 “포트 다른걸로 해”(src/App.tsx 지정)에 따라 기존 로컬 포트 `19080`을 Nginx 컨테이너 수신·호스트 루프백 바인딩·Cloudflare Tunnel 서비스 URL에 동일하게 사용하도록 설정했다. 영향 작업 ID: F12-02·05. Tunnel 공개 호스트는 `atms.approid.team`, HTTP 서비스 URL은 `http://app:19080`이며 외부 연결과 운영 배포는 아직 검증 전이다.

홈서버 운영을 고려하여 서버 사양과 저장 공간, 서비스 재시작, 집 밖에서의 접속, 백업 위치와 복원 절차를 확인하는 것을 권장한다. 운영비와 처리 가능한 규모는 실제 장비 및 사용량을 확인한 뒤 산정한다.

## 증빙 화면 홈서버 배포 준비 — 2026-10-06

사용자 “홈 서버에 배포하고 배포환경에서 테스트할거야”(src/App.tsx 지정)에 따라 기존 전용 경로 `/home/approid/atms.approid.team`과 Compose 프로젝트 `atms`를 현행 대상으로 다시 확인했다. SSH 접속과 기존 웹·API·DB 3개 컨테이너 healthy, 로컬 Nginx `127.0.0.1:19080` 화면/ready HTTP 200을 확인했다. 현재 운영 DB는 초기 마이그레이션 1개·테이블 2개이며 새 증빙 코드는 **아직 실행 중인 서비스에 적용하지 않았다**.

운영 DB의 배포 전 덤프를 권한 600의 `.artifacts/backups/pre-f03-browser-20261006/atms.dump`에 만들고 읽기 검사를 통과했다. 비밀 파일을 제외한 새 릴리스 115개 파일은 `.artifacts/releases/20261006-f03-browser/staged`에 별도로 전송해 SHA-256과 목록을 확인했다. 새 API·마이그레이션 이미지는 후보 태그로 빌드했다. 덤프에서 복원한 임시 DB에는 전체 11개 마이그레이션을 적용해 23개 테이블과 기존 메타데이터 행 지문 일치를 확인하고 임시 DB를 정리했다. 기존 서비스·운영 DB 스키마는 변경하지 않았다.

현행 홈서버에는 ATMS 터널 토큰이 없고 `atms.approid.team` DNS가 조회되지 않는다. API 비밀 환경에는 운영 `AUTH_WEB_ORIGIN`·SMTP·R2 값이 없다. P-09의 장기 백업 위치도 미확정이다. 외장 SSD `/mnt/external-ssd`는 연결돼 있고 여유 공간 844GiB를 확인했지만 백업 정책으로 선택된 값은 아니다. 공개 HTTPS/실제 로그인·증빙 등록을 포함한 배포 완료는 이 값들과 자격증명이 준비된 후 검증한다. 비밀값 원문은 문서나 검증 로그에 남기지 않는다.

후속 확인(2026-10-06): 사용자 “토큰까지 넣었어”(src/App.tsx 지정) 이후 홈서버의 `infra/secrets/tunnel.env` 존재·권한 600·비어 있지 않음을 확인했다. DNS는 A/AAAA 주소를 반환하지만 HTTPS ready 요청은 HTTP 530이다. 이는 현재 실행 중인 Compose에 Tunnel 서비스가 없고 연결이 성립하지 않은 상태의 관측값이며, 공개 경로 성공 근거가 아니다. `19080` 포트 수정은 115개 파일의 비밀 제외 배포 후보에 반영하고 원격 전체 해시 대사를 통과했다. 실행 중인 서비스는 아직 바꾸지 않았다. 운영 AUTH_WEB_ORIGIN·SMTP·R2 설정과 P-09 백업 위치는 계속 확인 대기다.

메일 운영 문서 확인(2026-10-06): 사용자 제공 `C:/Wspace/approid-company/Approid_메일서버_운영요약_2026-10-05.docx`에 같은 홈서버의 Mailcow, `mail.approid.team:587` STARTTLS, `primemaster@approid.team` SMTP 인증과 서버 내 권한 600 비밀번호 파일이 기록돼 있다. 현재 Mailcow 18개 서비스가 실행 중이며, 비밀번호를 출력하거나 메일을 전송하지 않고 TLS·SMTP AUTH 로그인을 재검증해 종료 코드 0(`SMTP_AUTH_PASS`)을 얻었다. 로컬 `server/.env`에는 R2 키 4개가 있으므로 R2 자체가 미설정이라는 이전 설명은 잘못이었다. 다만 운영 API 환경 파일로 전달하는 단계는 남아 있다. 외장 SSD의 기존 `/mnt/external-ssd/backups/johae-server/home/latest` 스냅샷은 ATMS 프로젝트 디렉터리를 포함하지만 PostgreSQL Docker 볼륨용 ATMS 백업 위치·복원은 아직 별도 확인 대상이다.

## ATMS 배포 실행 범위 확정 — 2026-10-06

사용자는 제시한 ATMS DB 백업 경로 `/mnt/external-ssd/backups/johae-server/atms`에 “확정”(src/App.tsx 지정)으로 동의했다. P-09 확인값: 홈서버 8논리 CPU·RAM 15,861MiB, 루트 여유 56GiB·외장 SSD 여유 844GiB, 배포 경로 `/home/approid/atms.approid.team`. 영향 작업 ID는 F12-01~09다. 기존 Mailcow SMTP와 로컬에 준비된 R2 설정을 같은 ATMS의 운영 API에 전달하고 단일 Nginx 포트 19080·전용 Tunnel을 연결하는 배포 범위를 실행한다. 원본 비밀 파일은 값을 출력하지 않고 보존하며, 기존 서비스·DB의 복구용 사본을 먼저 확보한다.

배포 검증은 7조건이다: 운영 설정 유효성·SMTP/R2 연결, 확정 위치의 DB 백업·임시 DB 복원, 원격 릴리스 일치, 운영 마이그레이션·기존 행 보존, 서비스·ClamAV 검사, 공개 HTTPS·API, 브라우저 화면. 각 조건은 실행 명령·종료 코드·JSON·화면 파일로 기록한다. 집 밖 독립 회선 확인, 장기 백업 예약·보존 정책, 실제 외부 메일 배달과 전체 F12 완료는 이번 배포 준비와 구분한다.

### 배포 결과 — 2026-10-06

위 7조건을 모두 PASS로 검증했다. 실행 파일과 집계 명령은 `.artifacts/implementation-f03-evidence-browser/verify-home-deployment.cjs`이며 `node .artifacts/implementation-f03-evidence-browser/verify-home-deployment.cjs` 종료 코드 0이다. [조건별 기록](../../.artifacts/implementation-f03-evidence-browser/home-deployment-checks.json), [서비스·DB·파일 기록](../../.artifacts/implementation-f03-evidence-browser/home-live-results.json), [Chrome 관측 기록](../../.artifacts/implementation-f03-evidence-browser/home-browser-results.json), [로그인 화면](../../.artifacts/implementation-f03-evidence-browser/home-login.png), [가입 화면](../../.artifacts/implementation-f03-evidence-browser/home-register.png)을 참조한다. 첫 검증6PASS/1FAIL은 검사기의 Origin 누락이었다. 출처 없는 POST는403, 올바른 출처의 잘못된 로그인 입력은400이 맞으므로 조건을 바로잡고 전체7조건을 재실행했다. [첫 기록](../../.artifacts/implementation-f03-evidence-browser/home-first-failed-results.json)을 보존한다.

접속 주소는 `https://atms.approid.team/login`, 가입은 `/register`, 로그인·회사 선택 후 증빙은 `/accounting/evidence`다. 공개 ready는200/database up, 미인증 세션은401이고 배포 HTML은 로컬 릴리스와 SHA-256이 일치했다. API·웹·DB·ClamAV는 healthy, Tunnel은 running이며 외부 HTTP 포트 공개 없이 호스트 루프백19080을 사용한다. 실제 정상 PDF 검사·EICAR 거부422, 운영 SMTP 인증·R2 HeadBucket을 확인했다. 계정 가입 메일을 보내거나 기존 메일함을 변경하지 않았다.

복구용 파일은 `/mnt/external-ssd/backups/johae-server/atms/pre-deploy-20261006-f03-browser`에 있다. 디렉터리700·덤프/설정 아카이브600이며 `atms.dump` SHA-256은 `89c90c8fdd78a1c3a3c4f35f4dd0941aef01e0305bf2e9f1eab3ba1685bc614f`다. 덤프에서 복원한 전용 임시 DB에11마이그레이션을 적용하고 기존 행 지문을 대조한 후 임시 DB를 제거했다. 운영 DB도11마이그레이션/23테이블·기존 메타데이터 지문 `b43621e4d144f777383e60d8b6dc39fa`를 유지한다. 배포 전 API 이미지는 `atms-api:pre-f03-browser-20261006`, 기존 웹 파일은 릴리스의 `previous-web`에 보존했다. DB 복원은 현재 업무 자료를 덮어쓰므로 필요 시 별도 복구 작업에서 범위·자료 시점을 확인한다.

미검증/후속: 사용자 계정으로 로그인한 업무·업로드 흐름, 실제 외부 수신함 배달, 집 밖 독립 회선 접속, 정기 ATMS DB 백업·보존 기간과 R2 원본의 별도 복원이다. 기존 `/home` 스냅샷은 PostgreSQL Docker 볼륨 백업을 대신하지 않는다. 위 한 번의 DB 덤프·복원 성공을 장기 백업 운영 완료로 보고하지 않는다. F12-01·06~09와 전체 G-WEB은 해당 조건을 충족할 때 별도 완료 처리한다.

## 관련 문서

먼저 확인할 기반 문서: [공통 시스템 기반](08-platform.md).

함께 검토할 문서: [회사와 사용자 권한](01-company-access.md), [증빙](03-evidence.md), [데이터 입출력과 외부 연동](10-data-integrations.md), [Windows 애플리케이션](11-windows.md), [회계기준과 세법 변경 관리](13-accounting-tax-rules.md).

기존 배포 참고 자료: [DEPLOYMENT.md](../../DEPLOYMENT.md). 다른 프로젝트의 설정이 포함되어 있으므로 실제 실행 전에 검토한다.

## 구현 후 검증 기준

- [ ] SSH 대상과 저장소·배포 경로·버전을 확인하고 배포 결과를 기록한다.
- [x] atms.approid.team의 HTTPS 응답, 터널 경로와 정상·오류 요청을 확인했다(2026-10-06 ready200·미인증401·출처 누락403·잘못된 입력400).
- [ ] 서버 또는 서비스 재시작 후 정해진 기동·상태 확인 절차를 검증한다.
- [ ] 백업을 별도 환경에 복원하여 전표·증빙·보고서 근거 자료를 대사한다.

## 미정 사항

- 장기 ATMS 백업 주기·보존 기간, 복구 목표와 운영 알림(위치와 이번 DB 덤프·복원은 확정/검증됨)
- 집 밖 독립 회선과 사용자 로그인 후 실제 업무·외부 메일 배달 검증

상세 의사결정은 [미정 사항 목록](../ROADMAP.md)을 함께 갱신한다. 새로운 기능이나 계약이 확정되면 이 문서를 수정하고 [인덱스](../README.md)의 범위·참조 경로도 갱신한다.
