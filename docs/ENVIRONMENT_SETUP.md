# ATMS 환경 구축 및 실행

## 최신 홈서버 배포 — 2026-10-07

Git `main`의 `dd06805`를 홈서버에 배포했다. 적용 전 외장 SSD 백업 5종의 SHA-256을 확인하고 임시 DB 복원·신규 migration 2개 적용·기존 27개 업무 테이블의 기존 열 지문 대조를 통과했다. 운영은 migration16·테이블30, API/app/PostgreSQL/ClamAV healthy, tunnel running이며 내부·외부 `/api/health/ready`와 `/companies`는 HTTP200, 미인증 기초 잔액 API는401이다. `.artifacts/web/index.html`의 로컬/배포 SHA-256은 `723c03734bde3bfd7cacc4351a4ea1bd01f061f87f5f5866c997b2434e360ae7`로 같다. 기존 migration 중 Windows 줄바꿈으로 적용된 파일은 DB에 기록된 체크섬과 운영 파일을 먼저 검증하고 정규화 SQL 내용이 같은 경우에만 해당 원본 바이트를 migration 이미지에 유지한다.

## 개발 중 배포 검증 원칙 — 2026-10-06 사용자 지시

홈서버 배포는 개발 중 테스트 환경이다. 사용자 “개발중에 자꾸 포트 새로 열어서 짜증나서 배포해서 테스트할려고 개발중 배포한거야”, “개발 이어해”를 근거로 개발을 계속하고 화면 검증은 기존 `https://atms.approid.team`과 `127.0.0.1:19080`을 사용한다. 새 로컬 미리보기 포트를 시작하지 않는다. 아래 기존 로컬 실행 절차는 과거 환경 구축 안내이며 현재 개발 재개 작업의 자동 실행 지시로 해석하지 않는다. 타입/빌드/lint·포트가 필요 없는 테스트는 로컬에서 실행할 수 있고, 웹 산출물을 홈서버에 반영한 뒤 같은 주소에서 검증한다.


[문서 인덱스](README.md) · [구현 계획서](IMPLEMENTATION_PLAN.md) · [공통 기반](features/08-platform.md) · [홈서버 운영](features/12-deployment.md)

기준일: 2026-10-05. 웹 개발 환경과 홈서버의 웹·API·DB 기반을 구축한다. 업무 API, 회사별 권한, 금액 처리와 회계 스키마는 후속 구현 대상이다. Windows 앱 환경은 웹 출시 검증 후 구축한다.

## 검증 기준과 구축 체크리스트

다음 다섯 가지 검증을 환경 구축 작업의 완료 조건으로 사용한다: 설치 및 빌드, API·DB 기동과 장애 응답, 웹 회귀 테스트, 홈서버 서비스 격리, 문서·체크리스트·Hindsight 일치. 외부 도메인 연결은 별도로 검증해야 한다.

- [x] **ENV-01** Node 24 개발 기준, 의존성 잠금 파일과 재현 가능한 초기화 명령을 준비한다.
- [x] **ENV-02** 로컬 PostgreSQL, Prisma 클라이언트와 초기 마이그레이션을 구성한다.
- [x] **ENV-03** NestJS API와 Vite의 `/api` 프록시를 구성하고 DB 장애·복구 응답을 검증한다.
- [x] **ENV-04** Vitest·Playwright를 설치하고 Appearance 회귀 테스트와 웹·API 빌드를 검증한다.
- [x] **ENV-05** 홈서버에 전용 경로·Compose 프로젝트·DB 계정을 구성하고 재시작·기존 서비스 격리를 검증한다.
- [x] **ENV-06** 인덱스와 기능 문서에 환경 구축 상태를 연결하고 Hindsight와 일치시킨다.
- [ ] **ENV-07** Cloudflare Tunnel과 `atms.approid.team` DNS·외부 HTTPS를 검증한다.

ENV 목록은 환경 구축 작업이다. 구현 계획서의 121개 업무 기능 및 출시 검증 수에 합산하지 않는다. 라이브러리 설치만으로 업무 기능을 완료 처리하지 않는다.

## 설치 버전과 구성

잠금 파일은 [웹 package-lock.json](../package-lock.json), [API package-lock.json](../server/package-lock.json)이다. 아래 버전은 이번 구축에서 설치·사용한 값이다.

| 영역 | 구성 |
| --- | --- |
| 로컬 실행 | Node 24.19.0, npm 11.17.0, Docker Desktop의 Linux 컨테이너 |
| 웹 | React 18, TypeScript 5, Vite 6.4.3, Tailwind CSS 3, Pretendard |
| 라우팅 | React Router DOM 7.18.4; v6 전환용 `future` 옵션 제거 |
| 서버 상태·표 | TanStack Query 5.104.1, TanStack Table 9.2.6 |
| 입력·검증 | React Hook Form 7.89.0, Zod 4.6.5, resolvers 5.9.1 |
| 그래프 | ECharts 6.1.0 설치; 업무 그래프 구현은 F09에서 진행 |
| API | NestJS 12.1.2, TypeScript 5.9.3, Helmet |
| DB | PostgreSQL 18.6 Alpine, Prisma client·adapter·CLI 7.10.0 |
| 테스트 | Vitest 5.0.3, Playwright 1.63.0 Chromium, 기존 Node 테스트 |
| 홈서버 | Zorin OS 18.1, Docker 29.8.1, Compose 5.5.1; API 컨테이너 Node 24.19.0 |
| 웹 서버 | Nginx 1.30.5 Alpine, 공식 stable 버전으로 고정 |

공식 근거: [NestJS 시작 조건](https://docs.nestjs.com/first-steps), [NestJS와 Prisma 구성](https://docs.nestjs.com/recipes/prisma), [PostgreSQL 공식 이미지](https://hub.docker.com/_/postgres), [React Router 변경 기록](https://reactrouter.com/changelog), [Nginx stable 다운로드](https://nginx.org/en/download.html)와 [보안 공지](https://nginx.org/en/security_advisories.html). PostgreSQL 18 이미지는 `/var/lib/postgresql`에 볼륨을 연결한다. Prisma 7은 별도 구성 파일의 URL과 PostgreSQL 드라이버 어댑터, CommonJS 클라이언트 생성을 사용한다.

## Windows 로컬 개발

Node 24.19.0, Git, Docker Desktop이 필요하다. Docker Desktop에서 Linux 엔진을 시작한다. 개발 기준 버전은 [.node-version](../.node-version)에 기록했다. PowerShell의 실행 정책 영향을 피하도록 아래는 `npm.cmd`를 사용한다.

저장소 루트에서 순서대로 실행한다. 각 명령이 성공한 뒤 다음 명령을 실행한다.

```powershell
node --version
docker version
npm.cmd ci
npm.cmd --prefix server ci
npm.cmd run env:init
npm.cmd run db:up
npm.cmd run api:build
npm.cmd run db:deploy
npm.cmd run dev:all
```

초기화는 [init-dev-env.mjs](../infra/scripts/init-dev-env.mjs)가 무작위 비밀번호를 생성하여 `infra/secrets/dev.env`, `server/.env`에 저장한다. 파일 내용은 출력하지 않으며 기존 파일은 보존한다. `.env.example`은 형식 참고용이며 실제 비밀번호를 기입해 커밋하지 않는다.

`dev:all`은 Vite, API TypeScript 감시 빌드, API 프로세스를 함께 실행한다. Vite는 `.artifacts`, 서버 소스·산출물, 비밀 파일과 테스트 보고서를 감시하지 않는다. Windows의 배포 로그 파일 잠금으로 개발 서버가 종료되는 문제를 방지한다. 이미 4173/4300 포트를 쓰는 ATMS 개발 프로세스가 있으면 먼저 해당 터미널에서 Ctrl+C로 종료한다. DB는 별도로 유지되며 `npm.cmd run db:down`으로 중지한다. 이 명령은 볼륨을 삭제하지 않는다.

| 대상 | 주소 |
| --- | --- |
| 웹 | `http://127.0.0.1:4173` |
| Appearance | `http://127.0.0.1:4173/settings?section=appearance` |
| API 직접 요청 | `http://127.0.0.1:4300/api/health/ready` |
| 웹을 통한 API | `http://127.0.0.1:4173/api/health/ready` |
| 로컬 DB | `127.0.0.1:55432`, DB·사용자 `atms` |

API의 `/api/health/live`는 프로세스 상태를 확인한다. `/api/health/ready`는 DB 쿼리에 성공하면 HTTP 200, DB 장애 시 503과 고정 오류 정보를 반환한다. DB 상세 오류와 비밀번호는 응답에 포함하지 않는다. F08-11의 로컬 추가 마이그레이션 적용 후 DB에는 `app_metadata`와 기반 업무 테이블 9개, 마이그레이션 이력이 있다. 실제 로그인과 전표 API는 후속 구현이다.

검증은 API와 DB를 기동한 상태에서 실행한다. Playwright는 4174 포트의 테스트용 웹 서버를 사용한다.

```powershell
npx.cmd playwright install chromium
npm.cmd test
npm.cmd run test:e2e
npm.cmd run api:build
npm.cmd run build -- --outDir .artifacts/web
npm.cmd --prefix server run db:status
```

웹 빌드는 기존 추적된 `dist` 대신 `.artifacts/web`에 저장한다. 테스트 보고서는 `playwright-report`, 실패 추적은 `test-results`에 생성한다. npm의 설치 스크립트 승인 경고가 발생할 수 있으며 이번 환경에서는 Prisma 생성과 Vite 빌드 성공을 직접 검증했다. 승인 범위를 무조건 전체로 설정하지 않는다.

## F08-11·F08-12 DB와 금액 검증

저장소 루트에서 로컬 PostgreSQL을 먼저 실행한 뒤 서버 검증을 묶어서 실행한다.

```powershell
npm.cmd run db:up
npm.cmd --prefix server run check:db
npm.cmd --prefix server test
```

`check:db`는 seed와 Prisma 구성의 타입을 검사한다. 서버 `test`는 Prisma 클라이언트 생성·TypeScript 빌드 뒤 금액·DB·기존 API/헬스 테스트를 모두 실행한다. DB 테스트는 `server/.env`의 로컬 `127.0.0.1:55432/atms` 연결을 확인하고 무작위 이름 `atms_verify_f081112_<16자리 hex>`의 새 DB를 생성한다. 전체 마이그레이션과 seed 반복·제약·NUMERIC 대사를 수행한 뒤 자신이 생성한 DB만 삭제한다. 따라서 테스트용 로컬 DB 계정에는 DB 생성 권한이 필요하다. 홈서버 런타임 계정에는 이 권한을 부여하지 않는다.

개발 seed는 `npm.cmd --prefix server run db:seed`로 명시적으로 실행하며 자동 마이그레이션에 포함되지 않는다. 다음 조건을 **모두** 만족해야 실행한다: `NODE_ENV=development` 또는 `test`, `ATMS_ALLOW_DEV_SEED=1`, PostgreSQL localhost/127.0.0.1:55432, DB 이름 `atms_dev_seed` 또는 위 검증 전용 이름. 기본 `/atms`, 원격 주소, 운영 환경은 실행 전에 거부한다. 별도 `atms_dev_seed` DB를 준비할 때 해당 DB에 마이그레이션을 적용하고 그 전용 연결 URL을 비밀 환경 변수로 주입해야 한다. 연결 URL이나 비밀번호를 로그에 출력하지 않는다.

seed는 단일 트랜잭션의 upsert로 회사 2·중지 사용자 2·소속 2·역할 5·회계연도 2·개발 템플릿 1·템플릿 항목 2·회사 계정 4개를 만든다. 비밀번호 해시와 로그인 세션은 만들지 않는다. 예시 계정은 검토된 공식 계정과목이 아니다. 로컬 기본 DB에는 추가 마이그레이션만 적용했고 seed는 실행하지 않았다. [DB·금액 구현과 검증 기록](features/08-data-money-design.md)을 참조한다.

기존 Prisma CLI 개발 의존성 high 4건은 그대로 남아 있다. tsx는 seed 실행용 개발 의존성이고 Decimal은 Prisma 제공 구현을 재사용한다. 이번 작업에서 주요 버전을 강제 변경하는 감사 자동 수정을 실행하지 않았다. 홈서버에 이번 새 마이그레이션을 배포한 결과는 검증하지 않았다.

## Zorin 홈서버 구축

### 첫 인증 서버 묶음의 추가 실행 조건

첫 서버 인증 코드는 로컬 추가 마이그레이션과 함께 적용했다. 테이블은 기존 10개에 `login_rate_buckets`·`audit_events`를 추가해 12개다. 기본 DB에 로그인용 대역 계정이나 개발 seed를 만들지 않았다. 테스트는 전용 `atms_verify_auth_<16자리 hex>` DB를 생성하여 활성·이메일 확인된 시험 사용자와 두 회사를 구성하고 종료 시 자신이 생성한 DB만 제거한다. 기존 F08-11 DB 테스트도 별도 DB에서 그대로 실행한다.

로컬 기본 HOST는 127.0.0.1이고 `AUTH_WEB_ORIGIN` 기본값은 `http://127.0.0.1:4173`이다. 포트나 localhost 이름을 바꾸면 실제 웹 Origin과 정확히 같은 값을 환경 변수에 지정해야 한다. HTTP 개발용 쿠키는 Origin과 HOST가 모두 루프백일 때만 허용된다. 비밀 환경 파일은 이번 구현에서 변경하지 않았다.

이 버전을 운영에 배포할 때는 **API 컨테이너 환경에 `NODE_ENV=production`과 `AUTH_WEB_ORIGIN=https://atms.approid.team`을 명시적으로 주입**해야 한다. 미설정 또는 HTTP Origin은 기동 설정 검사에서 거부한다. 기존 홈서버 Compose·프록시·터널은 이번 작업에서 변경하지 않았으므로 실제 배포 전에 환경 전달과 신뢰 프록시/IP 경로를 함께 구성·검증해야 한다. 운영 쿠키는 __Host-atms_session, HttpOnly·Secure·SameSite=Strict·Path=/·Domain 미지정이다.

일반 서버 검증은 `npm.cmd --prefix server run check:db`와 `npm.cmd --prefix server test`를 같은 묶음으로 실행한다. 첫 서버 묶음의 완료 검증 명령은 저장소 루트의 `powershell.exe -NoProfile -File .artifacts/implementation-f01-auth-session/run-verification.ps1`이다. 이 명령은 스키마·타입·전체 테스트, 운영 Docker 이미지 build·네트워크 없는 일회성 Argon2 검증, 로컬 기본 DB 추가 마이그레이션과 보존 검사, 문서/코드/예약 검사를 실행한다. 홈서버 접속·배포는 포함하지 않는다.

검증 결과는 전체 144개 테스트 PASS, 각 타입·빌드·컨테이너 명령 종료 코드 0이다. argon2 0.45.1·cookie-parser 1.4.7·타입 1.4.10을 고정했다. 기존 Prisma 개발 도구 high 4건은 남아 있고 강제 감사 수정은 실행하지 않았다. 홈서버 실제 Argon2 부하, 가입·이메일 전달·회사 관리·웹 화면은 후속 검증이다. [코드 흐름과 실행 근거](features/01-auth-session-design.md)를 참조한다.

배포 경로는 `/home/approid/atms.approid.team`, Compose 프로젝트는 `atms`이다. 기존 HUD 서비스가 9080 포트를 사용하므로 ATMS Nginx는 `127.0.0.1:19080`만 사용한다. 다른 서비스의 Compose 파일과 터널을 변경하지 않는다.

[compose.atms.yml](../infra/compose.atms.yml)이 PostgreSQL, 마이그레이션 실행 이미지, API, Nginx와 선택적 터널을 정의한다. DB와 API에는 호스트 공개 포트가 없다. API의 DB 사용자 `atms_app`은 테이블 DML 권한을 사용하고, 마이그레이션은 별도 소유자 계정 `atms`로 실행한다. 메모리 제한은 DB 256 MiB, API 256 MiB, Nginx 64 MiB, 선택적 터널 128 MiB이다. 초기 조회 시 서버 가용 RAM은 약 2.8 GiB, 디스크 여유는 약 63 GiB였으며 운영 규모를 보장하는 수치는 아니다.

이번 배포는 커밋 전 작업본의 선별 파일과 웹 빌드 산출물을 전송한 구성이다. 로컬 Git `origin`은 사용자 지정 저장소로 변경했다. 원격 저장소에 커밋·푸시는 수행하지 않았다. 이후 배포는 검토한 커밋과 잠금 파일을 기준으로 기록해야 한다.

신규 서버에는 아래 파일들을 같은 디렉터리 구조로 복사한다: `server` 소스·잠금 파일·Dockerfile, `infra/compose.atms.yml`, `infra/nginx/atms.conf`, `infra/postgres/init-app-role.sh`, `infra/scripts/atms-server.sh`, `infra/scripts/init-server-env.py`, `infra/scripts/set-atms-tunnel-token.sh`, `.artifacts/web`. `node_modules`, `.env`, `infra/secrets`의 실제 비밀 파일과 `.git`은 복사하지 않는다.

서버에서 실행한다.

```bash
cd /home/approid/atms.approid.team
bash infra/scripts/atms-server.sh setup
bash infra/scripts/atms-server.sh status
curl --fail http://127.0.0.1:19080/api/health/ready
```

`setup`은 비밀 파일을 최초 생성하고 DB 시작, 이미지 빌드, 마이그레이션 적용, API와 Nginx 기동을 수행한다. 비밀 파일 디렉터리는 700, 파일은 600이다. 초기화 재실행은 기존 자격 증명을 보존한다. API 런타임 설치에서 선택적 CLI 의존성을 제외하며 Prisma CLI는 마이그레이션 이미지에 포함한다.

```bash
# 상태 확인, 재시작 및 중지
bash infra/scripts/atms-server.sh status
docker compose -f infra/compose.atms.yml restart postgres api app
bash infra/scripts/atms-server.sh up
bash infra/scripts/atms-server.sh down
```

데이터 볼륨을 지우는 `down -v`는 초기화 절차가 아니다. 업무 데이터·증빙의 백업 위치와 복원 검증은 F12 후속 작업으로 남아 있다. 기존 루트 `DEPLOYMENT.md`와 `compose.zorin.yml`은 HUD용 과거 자료이고 ATMS 실행 절차는 이 문서를 따른다.

## Cloudflare Tunnel 연결

2026-10-06 사용자 제공 전용 토큰과 `19080` 서비스 경로를 배포해 `https://atms.approid.team/api/health/ready` HTTP200을 확인했다. 운영 SMTP/R2와 실제 ClamAV 검사도 통과했으며 자세한 현재 결과는 [홈서버 배포 결과](features/12-deployment.md#배포-결과--2026-10-06)를 따른다. 아래는 재설정 절차다.

1. Cloudflare에서 ATMS 전용 원격 관리 터널을 만들거나 지정한다.
2. 해당 터널의 공개 호스트를 `atms.approid.team`, 서비스 URL을 `http://app:19080`으로 설정한다. `tunnel` 컨테이너와 Nginx `app`은 같은 Compose 네트워크를 사용한다.
3. 서버에 SSH로 접속해 아래 명령을 실행하고 토큰을 숨김 입력한다. 토큰을 채팅·Git·명령 인자로 남기지 않는다.
4. 터널을 시작하고 Cloudflare DNS 및 외부 HTTPS를 확인한다.

```bash
cd /home/approid/atms.approid.team
bash infra/scripts/set-atms-tunnel-token.sh
bash infra/scripts/atms-server.sh tunnel
curl --fail https://atms.approid.team/api/health/ready
```

토큰은 `infra/secrets/tunnel.env`에 권한 600으로 저장한다. 다른 프로젝트에서 사용하는 터널 토큰을 자동으로 재사용하지 않는다. 홈서버 방화벽과 공유기에 신규 포트 포워딩을 추가할 필요는 없다.

## 후속 환경과 현재 한계

- Tauri 2, Rust, Visual Studio C++ Build Tools와 WebView2는 웹 출시 후 Windows 앱 단계에서 설치·검증한다.
- Redis·BullMQ는 실제 비동기 작업 필요 시 도입한다. 객체 저장소와 인증은 요구사항 결정 후 구성한다.
- 웹의 운영 의존성 감사와 선택적 CLI를 제외한 홈서버 API 운영 이미지 감사는 각각 0건이다. 전체 개발 의존성 감사에는 Tailwind 3 계열 high 5건, Prisma CLI 계열 high 4건이 남아 있다. 잠금 파일을 무조건 강제 업그레이드하지 않고 Tailwind 전환 및 Prisma 상위 버전 호환성을 별도 검토한다.
- 기존 템플릿 웹 번들은 약 1.34 MB이며 Vite 크기 경고가 있다. 회계 화면 전환 시 실제 모듈 분리·성능 검증을 진행한다.

## 검증 기록

로컬: 웹·API 빌드 종료 코드 0, Node Appearance 테스트 16개와 API Vitest 3개, Playwright 6개 통과. 실제 HTTP로 DB 정지 시 ready 503·live 200, 복구 후 ready 200을 확인했다. 홈서버: 웹·API·DB 3개 모두 healthy, 재시작 전후 ready 200, 초기 메타데이터 `1` 유지, 마이그레이션 최신 상태를 확인했다. 기존 컨테이너 63/63개의 ID와 시작 시각이 동일했다. DB·API 호스트 포트가 없고 API 계정은 superuser·DB 생성·역할 생성 권한이 없다. 비밀 파일 재초기화 전후 내용 해시가 같고 권한은 모두 600이었다. API 운영 이미지에 Prisma CLI가 없으며 감사 0건이다. 외부 DNS는 조회되지 않았다.

재현 가능한 이번 작업 근거는 로컬 `.artifacts/local-health.json`, `.artifacts/server-verification.json`과 Playwright 보고서이다. 문서 로컬 링크 334개에 깨진 경로가 없고 기존 계획서 139개 체크박스·업무 기능 121개·완료 7개를 보존했다. Hindsight `atms` 뱅크의 21개 문서 원문·해시·경로·태그가 일치함을 확인했다. `dev:all`의 웹 및 `/api` 프록시 HTTP 200도 검증했다.

## 가입·복구 개발 메일함

[두 번째 서버 묶음의 확정 범위](features/01-account-lifecycle-design.md)에서 Mailpit v1.31.4의 정확한 이미지 다이제스트를 고정했다. 개발 SMTP는 `127.0.0.1:1025`, 캡처 화면/API는 `http://127.0.0.1:8025`다. 포트는 루프백에만 바인딩하고 전달/릴레이를 설정하지 않는다. PostgreSQL 볼륨은 그대로 유지한다.

```powershell
docker compose --env-file infra/secrets/dev.env -f infra/compose.dev.yml up -d --no-deps mailpit
```

서버의 개발 기본값은 위 SMTP 주소와 `no-reply@atms.test`다. `server/.env`를 덮어쓰지 않는다. 운영에는 `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS=tls` 또는 `starttls`와 기존 HTTPS `AUTH_WEB_ORIGIN`을 제공해야 한다. 운영 설정 누락·개발 예외는 시작 시 거부한다. 현재 홈서버 Compose에는 SMTP 설정을 아직 연결하지 않았다. 자격 증명을 문서에 기입하지 않는다.

새 비밀번호 설정에는 HIBP HTTPS 범위 조회가 필요하며 시간 초과/비정상 응답이면 503으로 저장을 중단한다. 기존 로그인에는 외부 조회를 추가하지 않는다. 메일 링크의 `/verify-email`, `/reset-password` 화면은 후속 구현이다. 이번 테스트는 캡처한 링크의 토큰으로 실제 POST API를 검사하며 운영 수신함 배달을 검증하지 않는다.

가입·복구 서버 검증 완료(2026-10-05): 전체 테스트 190개·schema/build/DB 타입·운영 이미지·로컬 추가 마이그레이션과 기존 데이터 보존 통과. [실제 실행 기록](features/01-account-lifecycle-design.md#실제-실행-검증-기록)을 참조한다. 개발 SMTP 수락·캡처와 운영 수신함 실제 전달은 구분한다.


## 회사 기반 서버 묶음의 환경 검증

[회사 기반 설계](features/01-company-foundation-design.md)의 승인 범위를 구현·검증했다. 의존성·비밀값·홈서버 구성을 바꾸지 않고 `20261005040000_company_foundation` 추가 마이그레이션을 로컬에 적용했다. 테이블은 기존 13개를 유지하며 회사 열·기간 상한·감사 사건을 추가한다. 기존 4개 마이그레이션은 수정하지 않는다.

전체 명령은 `powershell.exe -NoProfile -File .artifacts/implementation-f01-company-foundation/run-verification.ps1`, 8개 완료 조건의 집계는 `python .artifacts/implementation-f01-company-foundation/verify.py`이다. 명령 실행기는 build/test 실패 때 로컬 기본 DB 적용을 생략한다. 회사 행동 테스트는 `atms_verify_companies_<16자리 hex>`, 구 데이터 업그레이드 테스트는 `atms_verify_company_upgrade_<16자리 hex>`의 자체 생성 DB만 사용하고 종료 시 제거한다. 기본 `/atms`에는 seed·시험 계정을 만들지 않는다. 회사 기간이 새 상한에 맞지 않는 경우 추가 마이그레이션 전체가 rollback하는지도 검증한다.

회사 서버 부분 검증 완료(2026-10-05): 전체 테스트 239개·8개 조건 PASS, schema/build/DB 타입·운영 이미지/모듈·로컬 추가 마이그레이션 각 exit 0. 기본 DB 13개 테이블·마이그레이션 5개, 기존 메타데이터/회사/기간/사용자/세션·실제 환경 파일을 보존했다. [실제 실행 기록](features/01-company-foundation-design.md#실제-실행-검증-기록)을 참조한다. 홈서버 배포·실제 회사 UI·운영 메일은 이번 검증에 포함하지 않는다.


## 구성원 서버 묶음의 환경 검증

[구성원 설계](features/01-company-members-design.md)의 승인 범위를 구현·검증했다. 의존성/비밀값/인프라를 바꾸지 않고 `20261005050000_company_members` 추가 마이그레이션을 로컬에 적용했다. 기존 모델/테이블 13개와 원래 소속/역할을 유지하며 CompanyMembership.version default 1과 양수 제약/감사 사건만 추가한다.

전체 명령은 `powershell.exe -NoProfile -File .artifacts/implementation-f01-company-members/run-verification.ps1`, 8개 조건과 최종 문서 집계는 `python .artifacts/implementation-f01-company-members/verify.py --final`이다. 테스트는 자체 생성 `atms_verify_members_<16자리 hex>` DB와 구 데이터용 `atms_verify_member_upgrade_<16자리 hex>` DB만 쓰고 종료 시 제거한다. build/test가 실패하면 로컬 기본 DB 적용은 생략한다. 기본 DB에 seed/시험 소속·세션은 만들지 않는다. 홈서버 배포·실제 초대/메일·화면은 후속이다.

구성원 서버 부분 검증 완료(2026-10-05): 전체 284개 테스트·8개 조건 PASS, schema/build/DB 타입·운영 컨테이너 build/runtime·로컬 추가 마이그레이션 각 exit 0. 로컬 기본 DB의 업무 테이블 13개·적용 마이그레이션 6개, 기존 자료/메타데이터·실제 환경 파일 보존을 확인했다. 회사/사용자/세션은 0/0/0으로 seed를 실행하지 않았다. 별도 기존 자료 업그레이드 테스트에서 version 초기값 1 및 양수 제약을 확인했다. [실제 실행 기록](features/01-company-members-design.md#실제-실행-검증-기록)과 [로컬 DB 증거](../.artifacts/implementation-f01-company-members/local-database-evidence.json)를 참조한다. Hindsight는 30분 예약을 유지하며 이번 최종 문서 원격 일치는 확인하지 않았다.

## 초대·접근 요청 서버 부분의 로컬 적용

2026-10-05: [초대·접근 요청 실행 기록](features/01-company-invitations-design.md#실제-실행-검증-기록)의 전체 347개 테스트·8개 조건이 통과했다. `20261005060000_company_access_flows` 추가 SQL을 로컬에 적용해 초대/접근 요청 테이블 2개를 더했으며 업무 테이블은 15개·마이그레이션은 7개다. 기존 자료·메타데이터·실제 환경/패키지/인프라를 보존했다. 기본 DB 회사/사용자/세션은 0/0/0, 새 초대/요청 테이블도 비어 있으며 기본 DB에 seed를 실행하지 않았다. [로컬 적용 증거](../.artifacts/implementation-f01-company-invitations/local-database-evidence.json)를 참조한다.

전체 명령은 `powershell.exe -NoProfile -File .artifacts/implementation-f01-company-invitations/run-verification.ps1`, 조건/문서 집계는 `python .artifacts/implementation-f01-company-invitations/verify.py --final`이다. 행동 검사는 자체 생성 `atms_verify_access_<16자리 hex>` DB에서, 구 자료 검사는 `atms_verify_access_upgrade_<16자리 hex>` DB에서 수행하고 자신이 생성한 DB만 제거한다. Mailpit 캡처는 로컬 개발 발송 증거이며 실제 수신함 배달을 뜻하지 않는다. 홈서버 배포/운영 SMTP·실제 화면은 실행하지 않았다. Hindsight는 PT30M 예약을 유지하며 최신 원격 문서 일치는 미검증이다.


## 회사 본인 승인 설정 서버 검증과 로컬 적용

2026-10-05: 사용자가 [회사 설정 설계](features/01-company-settings-design.md)를 지정한 “OK”로 여섯 선택·9개 파일을 확정했다. 기존 347개를 포함한 전체 391개 테스트와 8개 조건이 PASS다. schema/build/DB 타입/테스트·컨테이너 build/runtime·로컬 적용 명령은 모두 exit 0이다. `20261005070000_company_self_approval`은 감사 사건 CHECK만 확장하며 모델/업무 테이블은 15개, 적용 마이그레이션은 8개다. 기존 자료·회사/기간/소속/역할·메타데이터·실제 환경을 보존했고 기본 DB에 seed를 실행하지 않았다. 기본 DB 회사/사용자/세션은 0/0/0이다. [로컬 적용 증거](../.artifacts/implementation-f01-company-settings/local-database-evidence.json)와 [최종 결과](../.artifacts/implementation-f01-company-settings/results.json)를 참조한다.

전체 실행 명령은 `powershell.exe -NoProfile -File .artifacts/implementation-f01-company-settings/run-verification.ps1`, 완료 조건/문서 집계는 `python .artifacts/implementation-f01-company-settings/verify.py --final`이다. 행동 검사는 자체 생성 `atms_verify_settings_<hex>` DB에서, 업그레이드 검사는 `atms_verify_settings_upgrade_<hex>` DB에서 수행하고 자신이 생성한 DB만 제거했다. 업그레이드 검사는 기존 7개 SQL과 구 자료를 구성한 뒤 여덟 번째 SQL 적용 전후 15개 테이블의 모든 행을 대조했다. 실제 전표 승인 API·웹 화면·홈서버 배포/운영 SMTP는 이번 범위가 아니다. Hindsight는 PT30M 예약을 유지하며 최신 원격 문서 일치는 UNVERIFIED다.
