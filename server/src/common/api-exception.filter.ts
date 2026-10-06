import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter, type HttpServer } from '@nestjs/common'
import { ApiValidationException } from './api-validation'

// [F08-10 추가] 원본 예외 메시지 대신 상태별 고정 코드·안내를 사용한다.
const errors: Readonly<Record<number, readonly [string, string]>> = {
  400: ['BAD_REQUEST', '요청 형식을 확인해 주세요.'],
  401: ['UNAUTHORIZED', '로그인이 필요합니다.'],
  403: ['FORBIDDEN', '이 작업을 수행할 권한이 없습니다.'],
  404: ['NOT_FOUND', '요청한 항목을 찾을 수 없습니다.'],
  405: ['METHOD_NOT_ALLOWED', '허용되지 않은 요청 방식입니다.'],
  409: ['CONFLICT', '현재 상태와 요청이 충돌합니다.'],
  413: ['PAYLOAD_TOO_LARGE', '요청 크기가 허용 범위를 초과했습니다.'],
  429: ['TOO_MANY_REQUESTS', '잠시 후 다시 요청해 주세요.'],
  500: ['INTERNAL_ERROR', '요청을 처리하지 못했습니다.'],
  503: ['SERVICE_UNAVAILABLE', '서비스를 일시적으로 사용할 수 없습니다.'],
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)
  // [F08-10 수정] getHttpAdapter()의 공개 반환 타입인 HttpServer를 받는다.
  // 필터에는 응답 전송(reply) 계약만 필요하다. 어댑터 구현 클래스의 내부 멤버는 요구하지 않는다.
  constructor(private readonly adapter: HttpServer) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // 입력: 검증·HTTP·미들웨어·처리 중 발생한 예외. 출력: 상태 코드와 고정된 JSON 계약.
    // HTTP 오류의 상태는 보존하고, 알 수 없는 예외는 500으로 처리한다.
    let status = exception instanceof HttpException ? exception.getStatus() : 500
    // JSON 파서는 컨트롤러 전에 실패한다. 알려진 body-parser 오류만 400/413으로 분류한다.
    // body, message, stack 등 원본 데이터는 응답에 복사하지 않는다.
    if (exception instanceof Error && 'type' in exception) {
      if (exception.type === 'entity.parse.failed') status = 400
      if (exception.type === 'entity.too.large') status = 413
    }
    if (status < 400 || status > 599) status = 500

    const validation = exception instanceof ApiValidationException
    const [code, message] = validation
      ? ['VALIDATION_ERROR', '입력값을 확인해 주세요.']
      : errors[status] ?? ['HTTP_ERROR', '요청을 처리하지 못했습니다.']

    if (status >= 500) {
      // 여기서 남기는 로그에도 원본 예외·요청·DB 자격 증명을 쓰지 않는다.
      // 요청 식별자와 감사 로그는 F08-13의 후속 범위다.
      this.logger.error('API request failed with a server error.')
    }
    this.adapter.reply(host.switchToHttp().getResponse(), {
      code, message, details: validation ? exception.details : [],
    }, status)
  }
}
