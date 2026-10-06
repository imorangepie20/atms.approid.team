import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common'

export interface ValidationDetail { field: string; message: string }

/* [F08-10 추가: 안전하게 생성한 검증 오류를 다른 HTTP 오류와 구분]
 * details에는 입력값이나 Zod 원문 메시지를 담지 않는다.
 * 다른 예외의 임의 details/message를 공통 필터가 그대로 신뢰하지 않도록 별도 타입을 쓴다.
 */
export class ApiValidationException extends BadRequestException {
  constructor(readonly details: ValidationDetail[]) {
    super('입력값을 확인해 주세요.')
  }
}

// 내장 파이프가 실제 스키마 실행과 실패 시 컨트롤러 진입 차단을 담당한다.
// Body/Query/Param 데코레이터에 schema를 명시해야 검증된다. 스키마가 없는 입력은 검증하지 않는다.
// 후속 API는 z.strictObject로 정적 필드를 선언하고 금액에 z.coerce.number()를 사용하지 않는다.
export function createApiValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    // 스키마가 검증한 결과를 전달한다. 숫자로의 변환은 자동으로 추가하지 않는다.
    transform: true,
    exceptionFactory: issues => new ApiValidationException(issues.map(issue => ({
      // 정적 스키마 경로만 안내한다. 객체 전체 오류(예: 미정의 필드)는 input으로 표시한다.
      // Standard Schema는 경로 요소를 문자열·숫자 또는 { key } 형태로 제공한다.
      field: issue.path?.map(segment => {
        const key = typeof segment === 'object' ? segment.key : segment
        return typeof key === 'string' || typeof key === 'number' ? String(key) : 'input'
      }).join('.') || 'input',
      // 사용자 정의 스키마 메시지에도 비밀번호 등 입력값이 들어갈 수 있으므로 복사하지 않는다.
      message: '값의 형식이나 범위를 확인해 주세요.',
    }))),
  })
}
