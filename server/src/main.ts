/*
 * [F08-10 수정 영역: main.ts의 역할]
 * 이 파일은 NestJS API의 실행 시작점이다.
 * 실행 순서: 설정 확인 → 앱 생성 → 공통 설정 등록 → HTTP 요청 대기.
 * 이번 변경: 공통 설정 파일과 HTTP 초기화 함수를 연결해 입력 검증·공통 오류 계약을 실행한다.
 * 회사·로그인·금액 계산은 이후 단계이며 여기서는 API 기반만 구현한다.
 */

// NestJS가 생성자 타입·데코레이터 정보를 읽어 의존성을 주입할 때 사용할
// 메타데이터 API를 먼저 로드한다. 이 import는 값을 가져오는 대신 초기화를 수행한다.
import 'reflect-metadata'

// NestFactory: 루트 모듈을 바탕으로 NestJS 애플리케이션을 생성하는 진입 API.
import { NestFactory } from '@nestjs/core'

// AppModule: HealthModule을 통해 HealthController와 PrismaService를 연결한 루트 모듈.
// 이후 업무 모듈은 AppModule을 통해 애플리케이션에 연결한다.
import { AppModule } from './app.module'
import { readAppConfig } from './config/app.config'
import { configureApp } from './configure-app'

async function bootstrap() {
  // 1. [F08-10 수정] 기본값·환경 변수 검증을 공통 설정 파일 한 곳에서 관리한다.
  // 포트가 정수 범위 1~65535를 벗어나면 서버 생성 전에 실패한다.
  const config = readAppConfig()

  // 2. AppModule과 그 의존성을 생성하고 초기화한다.
  // await는 앱 생성이 끝날 때까지 이 함수의 다음 단계 진행을 기다린다.
  // PrismaService의 DB 연결 훅은 listen/init에서 실행하며 실패하면 기동이 완료되지 않는다.
  const app = await NestFactory.create(AppModule)

  // 3. [F08-10 구현] Helmet·/api 경로·입력 검증 파이프·공통 오류 필터를 등록한다.
  // configureApp은 운영과 HTTP 테스트에서 같은 설정을 실행하는 함수다.
  // Body/Query/Param에 선언한 스키마를 검증한 뒤에만 해당 컨트롤러 메서드가 실행된다.
  // 실패 응답은 code/message/details이며, 성공 응답은 기존 컨트롤러 결과 그대로다.
  configureApp(app, config)

  // 4. 종료 신호가 오면 NestJS의 종료 생명주기 훅을 실행하도록 설정한다.
  // 정상 종료 시 PrismaService의 onModuleDestroy가 DB 연결을 해제한다.
  app.enableShutdownHooks()

  // 5. 지정한 주소와 포트에서 HTTP 요청을 받기 시작한다.
  // 로컬 기본 주소 127.0.0.1은 이 컴퓨터에서만 접속할 수 있다.
  // 운영 컨테이너는 HOST=0.0.0.0으로 같은 Docker 네트워크의 Nginx 요청을 받는다.
  // listen이 완료되어야 이 함수가 성공적으로 종료된다.
  await app.listen(config.port, config.host)
}

// bootstrap()을 호출해 실제 기동을 시작한다.
// 이 함수에서 밖으로 전파되는 실패를 아래 catch에서 처리한다.
bootstrap().catch(() => {
  // 여기로 전달된 예외 객체를 직접 출력하지 않고 고정 안내 메시지를 남긴다.
  // NestJS 등에서 따로 남기는 로그까지 이 코드가 제어하는 것은 아니다.
  // 이 처리는 기동 실패용이며 실행 중 요청 오류를 처리하는 필터와는 별개다.
  console.error('ATMS API startup failed. Check server configuration and database availability.')

  // 프로세스가 종료될 때 실패 코드 1을 반환하도록 설정한다.
  // 즉시 종료하는 process.exit(1) 호출은 아니며 이 줄만으로 자원 정리를 보장하지 않는다.
  process.exitCode = 1
})
