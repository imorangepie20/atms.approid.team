import { NotFoundException, type INestApplication } from '@nestjs/common'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import type { AppConfig } from './config/app.config'
import { createApiValidationPipe } from './common/api-validation'
import { ApiExceptionFilter } from './common/api-exception.filter'

/* [F08-10 추가: 운영·테스트 공통 HTTP 초기화]
 * listen/init 이전에 한 번 호출한다. 테스트도 이 함수 자체를 사용해 운영 설정과의 차이를 막는다.
 * Helmet은 보안 헤더, 파이프는 컨트롤러 실행 전 입력 검증, 필터는 실패 응답 변환을 맡는다.
 * 인증·회사 권한·감사 이력은 F08-13과 F01에서 연결한다.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const adapter = app.getHttpAdapter()
  app.use(helmet())
  // [F01 추가] HttpOnly 쿠키를 서버에서 파싱한다. 전달된 프록시 헤더를 신뢰하도록 설정하지 않는다.
  // 홈서버 프록시 IP 신뢰 설정은 실제 배포 경로 검증과 함께 후속 단계에서 적용한다.
  app.use(cookieParser())
  // [F08-10 수정] 이 API 서버는 /api 아래의 리소스 경로만 제공한다.
  // NestJS 12의 기본 404는 prefix 밖에서 Express의 HTML 응답으로 빠질 수 있다.
  // 없는 경로는 next(예외)로 Nest의 전역 오류 계층에 넘겨 같은 JSON 필터를 거치게 한다.
  // 루트 /api와 /api/에도 리소스를 등록하지 않는다. 향후 루트 엔드포인트 추가 시 이 계약을 갱신한다.
  const resourcePrefix = `/${config.apiPrefix}/`
  app.use((request: unknown, _response: unknown, next: (error?: unknown) => void) => {
    // getRequestUrl은 공개 타입에서는 선택 항목이지만 Nest 라우터와 Express 어댑터가 필수로 제공한다.
    const path = adapter.getRequestUrl!(request).split('?')[0]
    if (!path.startsWith(resourcePrefix) || path === resourcePrefix) {
      next(new NotFoundException())
      return
    }
    next()
  })
  app.setGlobalPrefix(config.apiPrefix)
  app.useGlobalPipes(createApiValidationPipe())
  // Nest의 HTTP 어댑터가 실제 응답을 전송한다. Express 응답 타입에 직접 결합하지 않는다.
  app.useGlobalFilters(new ApiExceptionFilter(adapter))
}
