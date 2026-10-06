import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database.module'
import { RulesController } from './rules.controller'
import { RulesService } from './rules.service'

// [F13-01~03 추가] 기존 인증/회사 guard와 DB 연결을 재사용하고 규칙 조회만 공개한다.
@Module({ imports: [AuthModule, DatabaseModule], controllers: [RulesController], providers: [RulesService] })
export class RulesModule {}
