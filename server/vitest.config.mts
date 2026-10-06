import { defineConfig } from 'vitest/config'

export default defineConfig({
  // [F08-10 수정] 테스트 파일은 서버 tsconfig의 src include 범위 밖에 있다.
  // Vite 8의 Oxc 변환기에도 NestJS가 쓰는 기존 데코레이터 방식과 타입 메타데이터를 명시한다.
  // legacy는 @Body/@Query/@Param 같은 매개변수 데코레이터의 변환을 활성화한다.
  oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
