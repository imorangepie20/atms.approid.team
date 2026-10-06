# ATMS 개발 문서 인덱스

기초 잔액 첫 서버 묶음 부분 완료(2026-10-07): 사용자 `확정` 범위의 [O1~O8·API3개·구현19파일·K1~K8](features/04-opening-balance-foundation-design.md#전체-재검증-완료--2026-10-07)을 구현했다. 서버790·핵심91·DOM176·Appearance16과 schema/타입/build/lint를 통과했고 16 migration·기존139체크를 보존했다. 기초 잔액 화면·마감·정정·재무제표·세무 집계와 상위 F04/F05 완료는 후속이다.

회사 등록 자동완성·Sidebar 간격 수리 로컬 완료(2026-10-07): 새 회사 폼은 브라우저 저장 자격증명을 요청하지 않고 빈 값으로 시작하며, 서브메뉴는 데스크톱 36px/38px·모바일 44px로 조정했다. 관련 브라우저13·Appearance16·DOM176과 build/lint를 통과했다. 전체 E2E 추가 점검에서 발견한 기존 증빙 미리보기 4실패는 [구현 계획](IMPLEMENTATION_PLAN.md)의 분리 기록을 따른다.

POSTED 확정·원장 첫 서버 묶음 부분 완료(2026-10-07): 사용자가 `확정`(`IMPLEMENTATION_PLAN.md` 지정)한 [P1~P8·API3개·구현20파일·K1~K8](features/05-journal-posting-ledger-foundation-design.md)에 따라 APPROVED→POSTED·불변 posting·POSTED 전용 분개장/계정별 원장을 구현했다. 서버781·DOM176·Appearance16과 build/lint/schema/타입·격리 DB 검증을 통과했다. 기초 잔액·마감·정정·원장 화면·운영 배포와 F04/F05 전체 완료는 후속이다.

승인 요청·처리 화면과 홈서버 반영 부분 완료(2026-10-07, 사용자 “확정”·api.ts 지정): [A1~A8](features/05-approval-browser-design.md)의 API6개·화면/메뉴·운영 백업/복원·분리된 가상 회사의 실제 브라우저 흐름을 검증했다. [최종 K1~K8](../.artifacts/implementation-f05-approval-browser/results.json) 모두 PASS다. 전체 승인·배포 기능 체크와 POSTED 확정 이후는 계속 미완료다.

승인 요청·승인·반려 첫 서버 묶음 부분 완료(2026-10-07): 사용자 “확인”(api.ts 지정)으로 확정한 [W1~W8](features/05-journal-approval-foundation-design.md)의 상태·제출본·이력·6경로와 기존 초안 화면 상태 호환을 구현했다. [최종 K1~K8](../.artifacts/proposal-f05-journal-approval/results.json) 모두 PASS, 서버774·DOM157·Appearance16과 빌드/타입/schema/lint 종료0이다. 격리 DB만 사용하고 기존 체크139행을 유지했다. 승인 조작 화면·운영 적용·확정·원장·마감은 후속이다.

전표 초안 화면·홈서버 반영 부분 완료(2026-10-07): 사용자 “로그인완료”(api.ts 지정) 후 [B1~B8의 실제 브라우저 검증과 메뉴 수리](features/04-journal-draft-browser-design.md#실제-브라우저-검증과-b1-메뉴-수리-완료--2026-10-07)를 끝냈다. [최종 집계](../.artifacts/implementation-f04-journal-browser/results.json)는 K1~K8 PASS다. 가상 계정2·거래처1·PDF1·초안2를 실제 UI로 등록하고 첫 초안의 적요 수정/연결 해제로 version1→2→3, 최종2초안·4분개·1연결·초안감사4건·번호/작성자/합계/원본 불변·새로고침을 DB와 대조했다. B1 메뉴 누락을 발견해 Sidebar 링크와 실제 메뉴 진입 시험을 보강하고 전체 검증을 다시 실행했다. 서버761·DOM154·Appearance16·배포 브라우저12시험과 build/타입/schema/lint 종료0, 보호306파일·정책5개·139체크·과거14산출물·기존 업무 행·13migration/27테이블을 보존했다. 정적 메뉴 수정만 기존 홈서버에 추가 반영했고 HTTPS200/미인증 초안401·배포 index 해시 일치를 확인했다. 승인/확정·원장 등 후속 기능과 전체 F03/F04/출시 체크는 유지한다. Hindsight는 기존30분 예약에 맡기며 이번 문서의 원격 반영은 별도로 확인하지 않았다.

전표 초안 화면 확정(2026-10-07): 직전 [B1~B8·기존 API5개·17파일·K1~K8·홈서버 반영](features/04-journal-draft-browser-design.md) 제시 후 사용자 “확정”(설계 문서 지정)으로 전체를 선택했다. 서버 계약/정책을 유지하고 승인된 화면·배포·가상 자료 검증을 진행한다. 실제 완료와 구분하며 기존139행을 유지한다.

다음 범위 제안(2026-10-07): 사용자 “다음”(journal-draft-foundation.test.ts 지정)에 따라 [전표 초안 화면·증빙 역조회·홈서버 반영 B1~B8](features/04-journal-draft-browser-design.md)을 준비했다. 기존 API5개·구현17파일·완료 검증8조건이며 사용자 확정 대기다. 문서 준비와 서버 완료를 구분하고 코드/SQL 적용/배포/업무 체크는 변경하지 않는다.

전표 초안 서버 부분 완료(2026-10-07): 사용자 “수정해”(schema.prisma 지정)로 첫 중단 뒤 시험 준비/적용 이력을 수리하고 [K1~K8 전체 재검증](features/04-journal-draft-foundation-design.md#수리-후-전체-재검증-완료--2026-10-07)을 통과했다. 서버761·DOM80·Appearance16 PASS, build/타입/schema/lint 종료0. 기본 DB와 홈서버23테이블/12migration/계정2개·보호279파일/정책5개/139행을 보존했다. 초안 화면·홈서버 새 SQL/API 반영은 후속이며 첫 실패 보고서를 별도로 유지한다.

전표 초안 첫 서버 검증 중단(2026-10-07): [K1~K6/K8 FAIL·K7 PASS와 실패 계층](features/04-journal-draft-foundation-design.md#첫-서버-검증과-수리-중단--2026-10-07)을 기록했다. 완료 증빙을 삭제하는 시험 초기화와 기존 메일 시험 의존성부터 확인해야 한다. 서버667 PASS·72 FAIL·22 SKIP, DOM80 PASS. 기존 자료/정책/139행·홈서버23테이블/12migration/계정2개 보존. 첫 비통과7조건으로 수리를 중단했고 서버 기능·화면/배포는 미완료다.

전표 초안 서버 확정(2026-10-07): 직전 [J1~J8·API5개·15파일·검증8조건](features/04-journal-draft-foundation-design.md) 제시 후 사용자 “확정”(api.ts 지정)으로 전체 선택값을 승인했다. F04-03~07·10/F03-04/F08-13의 초안 서버 부분을 구현한다. 기존139행·정책과 계정 화면 완료 근거를 유지하고 서버 검증 뒤 초안 화면/홈서버 반영 범위를 제시한다. 번호·분개·연결·수정 계약은 담당 설계에 기록한다.

F04-01 계정과목 화면 부분 완료(2026-10-07): 승인 B1~B7·파일11개와 사용자 “로그인 완료” 후 [홈서버 실제 브라우저 검증](features/04-accounts-browser-design.md#실제-계정-브라우저-검증-완료--2026-10-07)을 끝냈다. 가상 계정2개 등록·이름 수정·중지·새로고침 뒤 조회와 ID/버전1→2→3·감사4건·기존 업무 행 보존을 확인했다. K1~K8 전체PASS이며 기존 서버681·DOM80·Appearance16·build/lint/타입/schema 결과와 가상 역할5/반응형3시험을 재집계했다. 표준 템플릿·기초 잔액·전표/원장과 전체 F04 체크는 후속이며 기존139개 체크 상태를 유지한다.

F04-01 계정과목 서버 부분 완료(2026-10-06): 사용자 “확정” 범위의 [API5·파일16·8조건PASS](features/04-accounts-foundation-design.md#전체-재검증-완료--2026-10-06). 서버681/26파일·schema/타입/build·프런트build/lint/Appearance16과 기존 자료 보존을 확인했다. [전표와 원장](features/04-journals-ledger.md)으로 이어지는 기반이며 계정 화면·표준 템플릿·홈서버 새 API 배포는 후속이다.

현재 개발(2026-10-06): 사용자 라이브러리 선택 위임으로 [F03-03 미리보기 묶음6조건 PASS](features/03-evidence-preview-design.md#pdfjs-수정-묶음의-검증-완료--2026-10-06)를 확인하고 홈서버에 반영했다. PDF/JPEG/PNG·화면·수명/권한/오류를 검증했다. 전체 F03 체크와 전표/원장 후속을 유지하며 [IDE 타입 오류 수리](DEVELOPMENT_TOOLS.md#테스트-파일-ide-오류-수리--2026-10-06)는 별도 기록이다.

홈서버 배포 연결 완료(2026-10-06): [공개 HTTPS·운영 SMTP/R2·DB 보존·ClamAV·Chrome 화면 7조건 PASS](features/12-deployment.md#배포-결과--2026-10-06). 사용자 로그인 후 실제 업무와 독립 집 밖 회선·외부 메일 배달·장기 백업 운영은 후속이다.

증빙 현황(2026-10-06): 첫 서버와 [첫 브라우저 화면](features/03-evidence-browser-design.md#b1b7-화면-부분-검증-완료--2026-10-06)이 각각 8조건 PASS다. 전체 API587·브라우저 E2E234·Appearance16과 실제 R2/ClamAV를 검증했다. 미리보기·전표 연결/원장 경로 및 홈서버 배포 검증은 별도이며 F03 상위 체크는 유지한다.

회계·세무 관리 시스템의 개발 문서를 찾는 시작점이다. 작업에 필요한 기능 문서와 그 문서의 기반·관련 문서를 선택해서 읽는다. 모든 문서를 매번 읽을 필요는 없다.

## 전체 개요와 개발 계획

- [전체 개요와 확정사항](PROJECT_DECISIONS.md): 제품 목적, 상태 구분과 현재 코드 기반
- [개발 순서와 미정 사항](ROADMAP.md): 구현 단계, 결정이 필요한 항목
- [구현 계획서 및 체크리스트](IMPLEMENTATION_PLAN.md): 사전 결정, 13개 기능의 구현 목록, 완료 여부와 출시 검증
- [환경 구축 및 실행](ENVIRONMENT_SETUP.md): 로컬 개발, 홈서버 기동과 Cloudflare 연결 절차
- [개발 도구와 작업 기록](DEVELOPMENT_TOOLS.md): Hindsight, 스킬 선택과 검증 원칙
- [Hindsight 등록과 동기화](HINDSIGHT_SYNC.md): 프로젝트 뱅크, 30분 예약 실행과 변경 검증

## 기능별 개발 문서

현재 요구사항을 큰 개발 단위로 묶으면 **총 13개**이다. 핵심 업무 7개와 공통 및 확장 개발 6개로 나눈 구현 계획이며, 세부 메뉴 수나 화면 수를 뜻하지 않는다. 재무제표는 통계 대시보드와 별도 업무 모듈로 다루고, 회계기준 및 세법 변경 관리는 전표, 세무 집계와 보고서에 공통 적용한다.

| 번호 | 카테고리 | 주요 구현 내용 |
| --- | --- | --- |
| 1 | [회사 및 사용자 권한](features/01-company-access.md) | 회사 관리, 로그인, 역할과 접근 권한 |
| 2 | [거래처](features/02-counterparties.md) | 고객사와 공급사 정보 |
| 3 | [증빙](features/03-evidence.md) | 영수증, 세금계산서와 첨부파일 |
| 4 | [전표 및 분개와 원장](features/04-journals-ledger.md) | 전표 입력, 차변·대변 검증과 장부 |
| 5 | [승인 및 마감과 정정](features/05-approval-closing.md) | 승인, 기간 마감과 변경 이력 |
| 6 | [세무 집계](features/06-tax.md) | 적용 연도와 계산 규칙에 따른 신고용 집계 |
| 7 | [재무제표](features/07-financial-statements.md) | 기준일 및 기간별 재무제표, 비교와 확정 보고서 |
| 8 | [공통 시스템 기반](features/08-platform.md) | 공통 화면, API, 데이터베이스, 금액 처리와 테스트 |
| 9 | [통계 및 대시보드](features/09-dashboard.md) | 매출, 비용, 손익과 현금 흐름의 ECharts 표시 |
| 10 | [데이터 입출력 및 외부 연동](features/10-data-integrations.md) | 가져오기, 내보내기와 필요한 기관 연동 |
| 11 | [Windows 앱](features/11-windows.md) | Tauri, 설치, 업데이트와 파일 및 인쇄 |
| 12 | [배포 및 운영](features/12-deployment.md) | 홈서버, Cloudflare Tunnel과 백업 및 복구 |
| 13 | [회계기준 및 세법 변경 관리](features/13-accounting-tax-rules.md) | 규칙 버전, 시행 및 적용 조건, 개정 검토와 과거 결과 재현 |

문서 번호는 기능을 찾기 위한 고정 번호이며 구현 순서가 아니다. 구현 전·선택 완료·기존 적용의 차이는 각 문서의 상태와 [전체 개요](PROJECT_DECISIONS.md)를 확인한다.

## 작업별 참조 경로

| 하려는 작업 | 먼저 읽을 문서 | 함께 확인할 문서 |
| --- | --- | --- |
| 개발 환경 설치·기동 및 홈서버 환경 구축 | [환경 구축 및 실행](ENVIRONMENT_SETUP.md) | [공통 기반](features/08-platform.md), [홈서버 운영](features/12-deployment.md) |
| 구현할 목록과 완료 여부 확인 | [구현 계획서 및 체크리스트](IMPLEMENTATION_PLAN.md) | [개발 순서와 미정 사항](ROADMAP.md), 각 기능 문서 |
| F04 전표 초안·증빙 연결 서버 부분 완료 | [J1~J8·API5개·15파일·수리 후K1~K8 PASS](features/04-journal-draft-foundation-design.md) | [전표와 원장](features/04-journals-ledger.md), [계정 화면 완료](features/04-accounts-browser-design.md), [승인과 마감](features/05-approval-closing.md) |
| F04·F03 전표 초안 입력 화면/증빙 경로와 홈서버 반영 제안 | [B1~B8·기존API5개·17파일·미실행K1~K8](features/04-journal-draft-browser-design.md) | [완료한 초안 서버](features/04-journal-draft-foundation-design.md), [증빙](features/03-evidence.md), [전표](features/04-journals-ledger.md) |
| F05 승인 요청·처리 화면과 운영 반영 제안 | [A1~A8·기존 승인 API6개·예정15파일·미실행K1~K8](features/05-approval-browser-design.md) | [완료한 승인 서버](features/05-journal-approval-foundation-design.md), [권한·마감](features/05-approval-closing.md), [배포](features/12-deployment.md) |
| F05·F04 POSTED 확정·원장 첫 서버 부분 완료 | [P1~P8·API3개·구현20파일·K1~K8 PASS](features/05-journal-posting-ledger-foundation-design.md) | [전표와 원장](features/04-journals-ledger.md), [승인과 마감](features/05-approval-closing.md), [구현 계획](IMPLEMENTATION_PLAN.md) |
| F04-02 기초 잔액 첫 서버 묶음 제안 | [O1~O8·API3개·구현19파일·미실행 K1~K8](features/04-opening-balance-foundation-design.md) | [전표와 원장](features/04-journals-ledger.md), [승인과 마감](features/05-approval-closing.md), [직전 POSTED·원장 기반](features/05-journal-posting-ledger-foundation-design.md) |
| Settings Appearance: 테마·강조색·글자 크기 | [공통 시스템 기반의 Appearance 계약](features/08-platform.md#settings--appearance-구현-계약) | [문서 동기화](HINDSIGHT_SYNC.md) |
| 로그인과 회사별 접근 제어 | [회사와 사용자 권한](features/01-company-access.md) | [공통 시스템 기반](features/08-platform.md) |
| F01·F08-13 첫 서버 묶음의 구현 범위·파일 목록 검토 | [첫 서버 묶음 확정·코드 흐름·검증 기록](features/01-auth-session-design.md) | [확정한 인증 정책](features/01-company-access.md#사용자-위임으로-확정한-인증-기본-정책), [구현 계획](IMPLEMENTATION_PLAN.md) |
| F01 가입·이메일 확인·복구/변경의 다음 서버 묶음 검토 | [확정 범위·구현 파일·검증 조건](features/01-account-lifecycle-design.md) | [인증 기본 정책](features/01-company-access.md#사용자-위임으로-확정한-인증-기본-정책), [첫 서버 묶음](features/01-auth-session-design.md), [구현 계획](IMPLEMENTATION_PLAN.md) |
| F01 회사 등록·선택·기간의 다음 서버 묶음 검토 | [회사 기반 확정·14개 구현 파일·239개 테스트/8개 PASS](features/01-company-foundation-design.md) | [회사 권한](features/01-company-access.md), [첫 회계 범위](features/07-financial-statements.md#사용자-위임으로-확정한-첫-회계-범위), [구현 계획](IMPLEMENTATION_PLAN.md) |
| F01 구성원 조회·역할 변경·소속 중지 서버 완료 근거 | [11개 구현 파일·실행 흐름·284개 테스트/8개 PASS](features/01-company-members-design.md) | [회사 권한](features/01-company-access.md), [직전 회사 서버](features/01-company-foundation-design.md), [구현 계획](IMPLEMENTATION_PLAN.md) |
| F01 관리자 초대·세무사 접근 요청 서버 완료 근거 | [14개 구현 파일·347개 테스트/8개 PASS·실행 흐름](features/01-company-invitations-design.md#실제-실행-검증-기록) | [회사 권한](features/01-company-access.md), [직전 구성원 서버](features/01-company-members-design.md), [구현 계획](IMPLEMENTATION_PLAN.md) |
| F01 회사 본인 승인 설정 서버 구현·검증 | [9개 구현 파일·391개 테스트·8개 PASS](features/01-company-settings-design.md#실제-실행-검증-기록) | [본인 승인 정책](features/05-approval-closing.md#확정한-본인-승인-정책), [현재 회사 권한](features/01-company-access.md), [구현 계획](IMPLEMENTATION_PLAN.md) |
| F13-01~03 규칙 버전 기반 서버 구현 | [12개 구현 파일·413개 테스트·8개 PASS](features/13-rule-version-foundation-design.md#실제-실행-검증-기록) | [회계기준·세법 변경 관리](features/13-accounting-tax-rules.md), [첫 회계 범위](features/07-financial-statements.md#사용자-위임으로-확정한-첫-회계-범위), [첫 세무 범위](features/06-tax.md#사용자-위임으로-확정한-첫-세무-범위) |
| F08-09·14·15 첫 실제 브라우저 화면 | [규칙 적용 현황·17개 파일 항목·8개 PASS](features/08-accounting-browser-design.md) | [규칙 버전 서버](features/13-rule-version-foundation-design.md), [공통 시스템 기반](features/08-platform.md) |
| F01·F08 회사 관리 첫 브라우저 화면 | [회사 목록·등록·선택·이름·회계연도](features/01-company-browser-design.md) | [회사 서버 기반](features/01-company-foundation-design.md), [회사와 사용자 권한](features/01-company-access.md) |
| F01·F08 회사 구성원 관리 브라우저 화면 | [구성원 조회·역할 변경·소속 중지·26개 브라우저 검증](features/01-company-members-browser-design.md) | [구성원 서버](features/01-company-members-design.md), [회사 관리 첫 화면](features/01-company-browser-design.md) |
| F01·F08 회사 초대·접근 요청 관리자 화면 | [관리자 API 7개·Mailpit/실DB·34개 브라우저 검증 완료](features/01-company-access-browser-design.md#실제-실행-검증-기록) | [초대·접근 요청 서버](features/01-company-invitations-design.md), [구성원 관리 화면](features/01-company-members-browser-design.md) |
| F01·F08 초대 수락·본인 회사 접근 요청 화면 | [확정값 8개·파일 항목 15개·검증 조건 8개 PASS·코드 흐름과 실행 증거](features/01-company-self-access-browser-design.md) | [기존 서버 계약](features/01-company-invitations-design.md), [직전 관리자 화면](features/01-company-access-browser-design.md) |
| F01·F08 회사 본인 승인 설정 화면 | [설정 변경·E2E82/API413·8개 PASS](features/01-company-settings-browser-design.md#설정-화면-실제-실행-증거--2026-10-06) | [설정 서버 계약](features/01-company-settings-design.md), [본인 승인 정책](features/05-approval-closing.md#확정한-본인-승인-정책) |
| F01·F08 가입·이메일 확인·복구 화면 | [메일·세션·E2E116/API413·8개 PASS](features/01-account-lifecycle-browser-design.md#이번-최종-실행-증거--2026-10-06) | [기존 계정 서버](features/01-account-lifecycle-design.md), [인증 정책](features/01-company-access.md#사용자-위임으로-확정한-인증-기본-정책) |
| F01·F08 로그인 중 비밀번호 변경·전체 기기 로그아웃 화면 | [확정값7·파일12·8조건PASS·계정 보안 화면 부분 완료](features/01-account-security-browser-design.md) | [계정 서버 계약](features/01-account-lifecycle-design.md), [직전 계정 화면](features/01-account-lifecycle-browser-design.md) |
| F02·F08 거래처 첫 브라우저 화면 | [T1~T7·기존API5개·파일14개·8PASS/실행 흐름](features/02-counterparties-browser-design.md) | [완료한 거래처 서버](features/02-counterparties-foundation-design.md), [거래처](features/02-counterparties.md), [구현 계획](IMPLEMENTATION_PLAN.md) |
| P-07 증빙 저장 정책 확정 | [D1~D5 실제 선택값·근거·확정일](features/03-evidence-storage-design.md) | [증빙 요구사항](features/03-evidence.md), [구현 계획](IMPLEMENTATION_PLAN.md), [거래처 화면 완료](features/02-counterparties-browser-design.md) |
| F03 첫 증빙 서버 | [25파일 승인·첫 서버 전체8PASS·브라우저 연결 후속](features/03-evidence-foundation-design.md) | [확정 저장 정책](features/03-evidence-storage-design.md), [증빙 요구사항](features/03-evidence.md), [회사와 사용자 권한](features/01-company-access.md) |
| F03·F08 첫 증빙 브라우저 | [B1~B7·기존 API 5개·13파일·화면 부분 8조건 PASS](features/03-evidence-browser-design.md) | [첫 증빙 서버](features/03-evidence-foundation-design.md), [증빙 요구사항](features/03-evidence.md), [구현 계획](IMPLEMENTATION_PLAN.md) |
| P-03 첫 회계기준·회계연도·재무제표 범위 | [사용자 위임으로 확정한 첫 회계 범위](features/07-financial-statements.md#사용자-위임으로-확정한-첫-회계-범위) | [전표와 분개 및 원장](features/04-journals-ledger.md), [회계기준과 세법 변경 관리](features/13-accounting-tax-rules.md) |
| P-04 첫 세목·신고 종류·지원 기간·검토 담당 | [사용자 위임으로 확정한 첫 세무 범위](features/06-tax.md#사용자-위임으로-확정한-첫-세무-범위) | [회사와 사용자 권한](features/01-company-access.md), [회계기준과 세법 변경 관리](features/13-accounting-tax-rules.md) |
| P-10 통화·소수·반올림·계정과목·기초 잔액 | [확정한 금액 정책](features/08-platform.md#확정한-금액-정책) | [확정한 계정과목과 기초 잔액](features/04-journals-ledger.md#확정한-계정과목과-기초-잔액), [세무 집계](features/06-tax.md) |
| F08-10 API 계약과 수정·생성 파일 확인 | [확정한 구현 계약](features/08-platform.md#f08-10-api-공통-구현-계약) | [구현 계획서](IMPLEMENTATION_PLAN.md), [실행 시작점](../server/src/main.ts) |
| F08-11·F08-12 DB 기반·개발 데이터·공통 금액 처리 | [확정 범위·구현 파일·검증 기록](features/08-data-money-design.md) | [금액 정책](features/08-platform.md#확정한-금액-정책), [회사 권한](features/01-company-access.md), [계정과목·기초 잔액](features/04-journals-ledger.md#확정한-계정과목과-기초-잔액) |
| 거래처 또는 증빙 등록 | [거래처](features/02-counterparties.md), [증빙](features/03-evidence.md) | [회사와 사용자 권한](features/01-company-access.md), [데이터 입출력과 외부 연동](features/10-data-integrations.md) |
| 전표 저장과 원장 조회 | [전표와 분개 및 원장](features/04-journals-ledger.md) | [공통 시스템 기반](features/08-platform.md), [승인과 마감 및 정정](features/05-approval-closing.md), [회계기준과 세법 변경 관리](features/13-accounting-tax-rules.md) |
| 과거 시점 재무제표와 확정본 재현 | [재무제표](features/07-financial-statements.md) | [전표와 분개 및 원장](features/04-journals-ledger.md), [승인과 마감 및 정정](features/05-approval-closing.md), [회계기준과 세법 변경 관리](features/13-accounting-tax-rules.md) |
| 세무 계산이나 회계기준·세법 개정 | [세무 집계](features/06-tax.md), [회계기준과 세법 변경 관리](features/13-accounting-tax-rules.md) | [재무제표](features/07-financial-statements.md), [공통 시스템 기반](features/08-platform.md) |
| 차트, 금액 표시와 공통 화면 | [통계와 대시보드](features/09-dashboard.md), [공통 시스템 기반](features/08-platform.md) | [재무제표](features/07-financial-statements.md) |
| 가져오기·내보내기와 기관 연동 | [데이터 입출력과 외부 연동](features/10-data-integrations.md) | [전표와 분개 및 원장](features/04-journals-ledger.md), [세무 집계](features/06-tax.md), [재무제표](features/07-financial-statements.md) |
| Windows 설치·업데이트·인쇄 | [Windows 애플리케이션](features/11-windows.md) | [공통 시스템 기반](features/08-platform.md), [배포와 홈서버 운영](features/12-deployment.md) |
| 홈서버 배포, 터널과 복구 | [배포와 홈서버 운영](features/12-deployment.md) | [공통 시스템 기반](features/08-platform.md), [기존 배포 참고 자료](../DEPLOYMENT.md) |
| Hindsight 등록·동기화와 스킬 설정 | [문서 동기화](HINDSIGHT_SYNC.md), [개발 도구](DEVELOPMENT_TOOLS.md) | [전체 개요](PROJECT_DECISIONS.md) |

## 문서 사용과 유지 규칙

거래처 서버 부분 완료: [C1~C7·API5개·승인15파일+회귀 수리1파일·8조건PASS](features/02-counterparties-foundation-design.md#최종-실행-검증--2026-10-06). 2026-10-06 사용자 “확정” 뒤 “수정해”로 같은 범위를 수리했다. API502·Appearance16·E2E156·build/lint 종료0, 로컬2DB 추가 SQL·기존 자료 보존·현재 UI/API200·거래처 미인증401을 확인했다. 화면·거래 이력은 후속이고 담당 요구사항은 [거래처](features/02-counterparties.md)다.

거래처 브라우저 부분 완료(2026-10-06): 구체적인 확인 질문에 사용자 “확정”으로 [T1~T7·기존API5개·파일14개](features/02-counterparties-browser-design.md)을 승인해 구현·검증했다. 8조건PASS·API502/Appearance16/E2E203·build/lint 종료0·실DB버전4/감사3/세션·기본21+기존브라우저20테이블보존/임시DB정리를 확인했다. 서버 C1~C7/P 정책·상위 체크를 유지하고 이전 문서 준비4PASS와 화면8PASS를 구분한다.

1. 인덱스에서 작업 대상 문서를 고른 뒤 목적·상태·입력과 결과·처리 규칙을 확인한다.
2. 관련 문서 중 변경 영향을 받는 항목을 확인한다. 금액·권한·전표·규칙·보고서 계약은 해당 기능의 기준 문서를 참조한다.
3. 요구사항이 미정이면 확정사항과 구분하고, 해당 기능 문서 및 개발 계획의 미정 사항에 기록한다.
4. 같은 상세 규칙을 여러 문서에 복사하지 않는다. 원래 담당 문서에 기록하고 다른 문서에서는 링크로 참조한다.
5. 기능 추가·이름 변경·파일 이동 시 이 인덱스와 관련 문서의 링크를 함께 수정한다. F01부터 F13까지의 ID는 현재 기능의 고정 식별자이다.
6. 작업 전에 객관적인 검증 조건을 정하고 결과와 근거를 기록한다. 문서의 미체크 항목은 구현 후 검증할 조건이며 통과 기록이 아니다.

에이전트의 문서 참조 및 완료 기준은 [루트 AGENTS.md](../AGENTS.md)에도 기록되어 있다.
