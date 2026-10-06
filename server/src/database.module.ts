import { Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

// [F08-13 추가] 헬스와 인증이 같은 연결 풀·초기화·종료 훅을 사용한다. 업무 트랜잭션은 이 서비스에서 시작한다.
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class DatabaseModule {}
