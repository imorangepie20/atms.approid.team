import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { DatabaseModule } from './database.module'

/* [F08-10 추가: 기존 헬스 기능을 모듈로 분리]
 * controllers는 HTTP 경로, providers는 주입할 서비스를 등록한다.
 * PrismaService 인스턴스가 기존 DB 연결·종료 훅을 담당한다. 서비스 구현은 바꾸지 않는다.
 */
// [F08-13 수정] 중복 DB 인스턴스 대신 공유 모듈을 사용한다. 기존 live/ready 응답 계약은 유지한다.
@Module({ imports: [DatabaseModule], controllers: [HealthController] })
export class HealthModule {}
